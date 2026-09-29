/**
 * NETRA — Phase 2C ESP32 Hardware Telemetry Client + Local Safety Warning
 *
 * ─── DUAL RESPONSIBILITY ──────────────────────────────────────────────────
 *
 * 1. BACKEND TELEMETRY (unchanged from Step 1)
 *    Sends raw sensor readings to POST /api/telemetry/hardware.
 *    The backend (v2v_engine.py) is the ONLY authoritative source for the
 *    official NETRA risk assessment, fleet state and control-room view.
 *
 *    The ESP32 MUST NOT calculate or send:
 *      TTC, risk_score, risk_level, recommended_action, route_distance, section_id
 *
 * 2. LOCAL SAFETY WARNING (new in Step 2)
 *    Independent of Wi-Fi / backend / database.
 *    Drives a buzzer and warning LED based on raw HC-SR04 proximity alone.
 *    Serves as an immediate physical fallback when network is unavailable.
 *
 *    IMPORTANT: This is a PROTOTYPE DEMO threshold, NOT a certified mine
 *    operating limit (DGMS / NMDC). It mirrors the NETRA backend bands for
 *    consistency only.
 *
 *    LOCAL THRESHOLDS:
 *      distance < 10 m         → CRITICAL  (continuous buzzer + red LED)
 *      10 m ≤ distance < 20 m  → HIGH      (intermittent buzzer + LED)
 *      distance ≥ 20 m         → NORMAL    (buzzer OFF, LED OFF)
 *      invalid / fault         → SENSOR FAULT (fault pattern — fail-safe)
 *
 * ─── HARDWARE ─────────────────────────────────────────────────────────────
 *   Board    : ESP32 DevKit v1 (or compatible)
 *   GPS      : NEO-6M / NEO-8M on Serial2 (RX2=GPIO16, TX2=GPIO17)
 *   Radar    : HC-SR04 (TRIG=GPIO5, ECHO=GPIO18)
 *   Buzzer   : Active or passive buzzer on GPIO 25
 *   Warn LED : Red/amber LED on GPIO 26 (with appropriate current-limit resistor)
 *
 * ─── GPIO ASSIGNMENTS (must not conflict with GPS Serial2 = GPIO16/17) ─────
 *   GPIO  5  : HC-SR04 TRIG (existing)
 *   GPIO 18  : HC-SR04 ECHO (existing)
 *   GPIO 16  : GPS RX2  (existing — do NOT reuse)
 *   GPIO 17  : GPS TX2  (existing — do NOT reuse)
 *   GPIO 25  : BUZZER   (new — DAC1, safe general-purpose output)
 *   GPIO 26  : WARN LED (new — DAC2, safe general-purpose output)
 *
 * ─── LIBRARIES (Arduino Library Manager) ──────────────────────────────────
 *   TinyGPSPlus  https://github.com/mikalhart/TinyGPSPlus
 *   ArduinoJson  >= 6.x  https://arduinojson.org
 *   WiFi         bundled with ESP32 Arduino core
 *   HTTPClient   bundled with ESP32 Arduino core
 *
 * ─── CONFIGURATION ────────────────────────────────────────────────────────
 * Edit the CONFIG section below for your demo network.
 * Do NOT commit real Wi-Fi credentials or production IPs.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TinyGPSPlus.h>
#include <time.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ============================================================
// CONFIG — change these for your demo network / deployment
// ============================================================

// Helper to stringify a numeric macro (e.g. BACKEND_PORT) for URL building.
#define _STRINGIFY(x) #x
#define STRINGIFY(x) _STRINGIFY(x)

// Vehicle identifier — must be "HEMM-01" or "HEMM-02"
#define VEHICLE_ID "HEMM-01"

// Wi-Fi credentials (placeholder — do NOT commit real values)
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ── Backend address (Phase 3: single place to configure) ───────────────────
// The ESP32 and the backend PC must be on the SAME Wi-Fi/LAN.
// Set BACKEND_LAN_IP to the backend PC's LAN IPv4 address (e.g. from
// `ipconfig` / `ifconfig` on that machine) — NEVER "localhost" or
// "127.0.0.1", since that would resolve to the ESP32 itself, not the PC.
// Do not guess a random IP: if it isn't known yet, leave the placeholder and
// fill it in before flashing — every other endpoint below derives from this
// one value, so nothing else needs to change.
#define BACKEND_LAN_IP "192.168.1.100"   // <-- SET THIS to the backend PC's LAN IP
#define BACKEND_PORT   8000

// Backend FastAPI base URL, built once from BACKEND_LAN_IP/BACKEND_PORT above.
#define BACKEND_HOST      "http://" BACKEND_LAN_IP ":" STRINGIFY(BACKEND_PORT)
#define HARDWARE_ENDPOINT BACKEND_HOST "/api/telemetry/hardware"

// Feature 11 / Phase 2: ESP32 safety-state poll — pure GET, read-only, no
// local computation of blind-curve distance, TTC, or risk. The backend
// (esp.py, backed by blind_curve_state_service.py + the existing
// v2v_engine.py) is the sole authority; the ESP32 just displays the
// state/curve_id/distance_to_curve/vehicle_alert fields it returns.
#define SAFETY_STATE_ENDPOINT BACKEND_HOST "/api/esp/" VEHICLE_ID "/safety-state"

// Phase 3: HTTP timeout for the safety-state poll, so a dropped/slow LAN
// connection cannot block the loop indefinitely.
#define SAFETY_STATE_HTTP_TIMEOUT_MS 3000

// Telemetry publish interval (milliseconds)
// Local safety runs independently on every loop iteration.
#define PUBLISH_INTERVAL_MS 1000

// NTP
#define NTP_SERVER          "pool.ntp.org"
#define GMT_OFFSET_SEC      0
#define DAYLIGHT_OFFSET_SEC 0

// ── HC-SR04 ultrasonic radar ──────────────────────────────────────────────
#define TRIG_PIN 5
#define ECHO_PIN 18

// ── GPS Serial2 ───────────────────────────────────────────────────────────
#define GPS_BAUD 9600
// RX2 = GPIO16, TX2 = GPIO17 (do not reassign)

// ── Local safety warning output pins (NEW in Phase 2C Step 2) ────────────
// These pins must not conflict with GPS Serial2 (GPIO16/17) or HC-SR04 (5/18).
#define BUZZER_PIN   25   // GPIO25 — active buzzer output
#define WARN_LED_PIN 26   // GPIO26 — red/amber warning LED output

// ── OLED display (Feature 11) — I2C, default ESP32 pins SDA=21/SCL=22 ─────
// Does not conflict with GPS Serial2 (16/17), HC-SR04 (5/18) or buzzer/LED (25/26).
#define OLED_WIDTH    128
#define OLED_HEIGHT   64
#define OLED_ADDR     0x3C
#define OLED_RESET    -1  // no dedicated reset pin
Adafruit_SSD1306 oled(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);
static bool oledReady = false;

// Last rendered safety-state key (state|curve_id|distance|vehicle flag), or
// the raw hazard_state string in the back-compat fallback path. Used only to
// avoid re-logging an unchanged state on every poll; the OLED itself is
// still refreshed from the latest values on every successful poll.
static String lastHazardState = "SAFE";

// Phase 3: tracks whether the last safety-state poll reached the backend, so
// "[NETRA] Backend connected" / "[WARN] Backend unreachable" are logged only
// on change — never spammed every poll cycle.
static bool lastBackendReachable = false;

// ─── LOCAL SAFETY THRESHOLDS (PROTOTYPE DEMO — not DGMS-certified) ────────
// Mirrors the NETRA backend risk bands for physical consistency.
// CRITICAL : distance < 10 m
// HIGH     : distance < 20 m
// NORMAL   : distance >= 20 m
#define LOCAL_CRITICAL_M  10.0f
#define LOCAL_HIGH_M      20.0f

// ─── BUZZER / LED TIMING (milliseconds, millis()-based — no blocking delay) ─
#define BUZZER_CRITICAL_ON_MS   200   // CRITICAL: 200 ms ON / 100 ms OFF (fast pulse)
#define BUZZER_CRITICAL_OFF_MS  100
#define BUZZER_HIGH_ON_MS       200   // HIGH: 200 ms ON / 600 ms OFF (slow pulse)
#define BUZZER_HIGH_OFF_MS      600
#define BUZZER_FAULT_ON_MS      100   // SENSOR FAULT: three rapid beeps
#define BUZZER_FAULT_OFF_MS     100
#define BUZZER_FAULT_PAUSE_MS   700   // Gap between fault triple-beeps

// ─── DEMO SENSOR MODE ─────────────────────────────────────────────────────
// When true: HC-SR04 is replaced by a controlled distance sequence so that
// local safety behavior can be verified without physical hardware.
//
// *** WARNING: DEMO_SENSOR_MODE = true means NO REAL SENSOR IS USED. ***
// *** Set to false before deploying on physical hardware.             ***
#define DEMO_SENSOR_MODE true

// Demo sequence cycle period (ms between distance steps)
#define DEMO_CYCLE_MS 3000

// ============================================================
// LOCAL SAFETY STATE MACHINE
// ============================================================

enum LocalSafetyLevel { LS_NORMAL, LS_HIGH, LS_CRITICAL, LS_SENSOR_FAULT };

// Internal warning state
struct WarnState {
  LocalSafetyLevel level     = LS_NORMAL;
  bool             buzzerOn  = false;
  bool             ledOn     = false;
  unsigned long    lastTogMs = 0;   // last buzzer/LED toggle timestamp
  int              faultBeepCount = 0; // counts beeps within fault triple
};

static WarnState warnState;

// ============================================================
// GLOBALS
// ============================================================

TinyGPSPlus      gps;
HardwareSerial   gpsSerial(2);  // Serial2

unsigned long lastPublishMs = 0;

// Demo mode: current step index and last step timestamp
#if DEMO_SENSOR_MODE
  static int           demoStep    = 0;
  static unsigned long demoLastMs  = 0;

  // Demo sequence: {distance_m, description}
  // -1.0 simulates an invalid sensor reading (SENSOR FAULT)
  struct DemoStep { float distM; const char* label; };
  static const DemoStep DEMO_SEQ[] = {
    { 25.0f, "NORMAL  (25.0 m)"  },
    { 15.2f, "HIGH    (15.2 m)"  },
    {  7.8f, "CRITICAL (7.8 m)"  },
    { -1.0f, "SENSOR FAULT"      },
  };
  static const int DEMO_SEQ_LEN = sizeof(DEMO_SEQ) / sizeof(DEMO_SEQ[0]);
#endif

// ============================================================
// HC-SR04 / DEMO SENSOR READ
// ============================================================

/**
 * Read proximity distance in meters.
 * In DEMO_SENSOR_MODE returns controlled demo values.
 * In real mode reads HC-SR04; returns -1.0 on timeout / sensor error.
 */
float readObstacleDistanceM() {
#if DEMO_SENSOR_MODE
  unsigned long now = millis();
  if (now - demoLastMs >= DEMO_CYCLE_MS) {
    demoLastMs = now;
    demoStep   = (demoStep + 1) % DEMO_SEQ_LEN;
    Serial.print("[DEMO SENSOR] Advancing to step: ");
    Serial.println(DEMO_SEQ[demoStep].label);
  }
  return DEMO_SEQ[demoStep].distM;
#else
  // ── Real HC-SR04 ───────────────────────────────────────────────────────
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  // 30 ms timeout → max measurable range ≈ 5 m (HC-SR04 rated to ~4 m)
  long durationUs = pulseIn(ECHO_PIN, HIGH, 30000);
  if (durationUs == 0) return -1.0f;  // Timeout = no echo = no obstacle or sensor error
  return (durationUs * 0.000343f) / 2.0f;  // speed of sound ≈ 343 m/s
#endif
}

// ============================================================
// LOCAL SAFETY ASSESSMENT (pure function, no I/O)
// ============================================================

/**
 * Classify distance into a local safety level.
 * Invalid distance (< 0) is conservatively treated as SENSOR FAULT,
 * NOT as NORMAL / clear-path.
 *
 * These thresholds are PROTOTYPE DEMO values aligned with the NETRA
 * backend risk bands. They are not certified mine operating limits.
 */
LocalSafetyLevel classifyLocalSafety(float distM) {
  if (distM < 0.0f)          return LS_SENSOR_FAULT;
  if (distM < LOCAL_CRITICAL_M) return LS_CRITICAL;
  if (distM < LOCAL_HIGH_M)     return LS_HIGH;
  return LS_NORMAL;
}

// ============================================================
// BUZZER + LED NON-BLOCKING CONTROL
// ============================================================

/**
 * setOutput — drive buzzer and LED pin directly.
 */
inline void setOutput(bool buzzer, bool led) {
  digitalWrite(BUZZER_PIN,   buzzer ? HIGH : LOW);
  digitalWrite(WARN_LED_PIN, led    ? HIGH : LOW);
  warnState.buzzerOn = buzzer;
  warnState.ledOn    = led;
}

/**
 * updateLocalWarning — called every loop iteration.
 * Uses millis() timing; never blocks.
 * Pattern behaviour:
 *
 *   NORMAL      : buzzer OFF, LED OFF (immediate)
 *   HIGH        : 200 ms ON / 600 ms OFF intermittent buzz + LED sync
 *   CRITICAL    : 200 ms ON / 100 ms OFF rapid continuous buzz + LED sync
 *   SENSOR FAULT: triple short beep (100/100/100/100/100) then 700 ms pause
 */
void updateLocalWarning(LocalSafetyLevel newLevel) {
  unsigned long now = millis();

  // On level transition, reset timing and log immediately
  if (newLevel != warnState.level) {
    warnState.level         = newLevel;
    warnState.lastTogMs     = now;
    warnState.faultBeepCount = 0;
    setOutput(false, false);  // safe starting state on transition

    switch (newLevel) {
      case LS_NORMAL:
        Serial.println("[LOCAL SAFETY] NORMAL");
        break;
      case LS_HIGH:
        Serial.println("[LOCAL SAFETY] HIGH");
        break;
      case LS_CRITICAL:
        Serial.println("[LOCAL SAFETY] CRITICAL");
        break;
      case LS_SENSOR_FAULT:
        Serial.println("[LOCAL SAFETY] SENSOR FAULT");
        break;
    }
  }

  // ── Per-level non-blocking pattern ──────────────────────────────────────
  switch (warnState.level) {

    case LS_NORMAL:
      // Ensure everything is off
      if (warnState.buzzerOn || warnState.ledOn) setOutput(false, false);
      break;

    case LS_HIGH: {
      // Slow intermittent: 200 ms ON, 600 ms OFF
      unsigned long period = warnState.buzzerOn ? BUZZER_HIGH_ON_MS : BUZZER_HIGH_OFF_MS;
      if (now - warnState.lastTogMs >= period) {
        warnState.lastTogMs = now;
        bool next = !warnState.buzzerOn;
        setOutput(next, next);  // LED tracks buzzer
      }
      break;
    }

    case LS_CRITICAL: {
      // Fast continuous: 200 ms ON, 100 ms OFF
      unsigned long period = warnState.buzzerOn ? BUZZER_CRITICAL_ON_MS : BUZZER_CRITICAL_OFF_MS;
      if (now - warnState.lastTogMs >= period) {
        warnState.lastTogMs = now;
        bool next = !warnState.buzzerOn;
        setOutput(next, next);  // LED tracks buzzer
      }
      break;
    }

    case LS_SENSOR_FAULT: {
      // Triple-beep pattern: beep-beep-beep ... (pause) ... repeat
      // Each beep: 100 ms ON, 100 ms OFF; after 3 beeps → 700 ms pause
      if (warnState.faultBeepCount < 6) {
        // Still in triple-beep phase (3 × ON + 3 × OFF = 6 half-periods)
        unsigned long period = BUZZER_FAULT_ON_MS;
        if (now - warnState.lastTogMs >= period) {
          warnState.lastTogMs = now;
          bool next = (warnState.faultBeepCount % 2 == 0); // even = ON
          setOutput(next, next);
          warnState.faultBeepCount++;
        }
      } else {
        // Pause phase
        if (now - warnState.lastTogMs >= (unsigned long)BUZZER_FAULT_PAUSE_MS) {
          warnState.lastTogMs      = now;
          warnState.faultBeepCount = 0;
          setOutput(false, false);  // start of a new triple-beep
        }
      }
      break;
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

String getISO8601Timestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "1970-01-01T00:00:00Z";  // NTP not ready
  }
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

String getSensorStatus(bool gpsValid, float obstacleM) {
  if (obstacleM < 0.0f) return "WARNING";   // Radar timeout
  if (!gpsValid)         return "WARNING";
  return "HEALTHY";
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n[NETRA] =========================================");
  Serial.println("[NETRA] ESP32 Hardware Telemetry + Local Warning");
  Serial.print  ("[NETRA] Vehicle ID  : ");
  Serial.println(VEHICLE_ID);
  Serial.print  ("[NETRA] Backend     : ");
  Serial.println(HARDWARE_ENDPOINT);
#if DEMO_SENSOR_MODE
  Serial.println("[NETRA] *** DEMO_SENSOR_MODE = true ***");
  Serial.println("[NETRA] *** Real HC-SR04 is NOT active ***");
  Serial.println("[NETRA] *** Controlled demo distances in use ***");
#endif
  Serial.println("[NETRA] =========================================\n");

  // ── HC-SR04 pins ─────────────────────────────────────────────────────────
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  // ── Local warning output pins ─────────────────────────────────────────────
  pinMode(BUZZER_PIN,   OUTPUT);
  pinMode(WARN_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN,   LOW);
  digitalWrite(WARN_LED_PIN, LOW);

  // ── GPS Serial ────────────────────────────────────────────────────────────
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, 16, 17);  // RX2=GPIO16, TX2=GPIO17
  Serial.println("[NETRA] GPS serial started (RX2=GPIO16, TX2=GPIO17).");

  // ── OLED (Feature 11) ───────────────────────────────────────────────────
  Wire.begin();
  oledReady = oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (oledReady) {
    oled.clearDisplay();
    oled.setTextColor(SSD1306_WHITE);
    oled.setTextSize(2);
    oled.setCursor(0, 0);
    oled.println("SAFE");
    oled.display();
  } else {
    Serial.println("[WARN]  OLED not found at init — display will stay blank.");
  }

  // ── Wi-Fi ─────────────────────────────────────────────────────────────────
  Serial.print("[NETRA] Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    // Non-blocking during setup: brief delay only during initial Wi-Fi wait.
    // Local safety polling begins as soon as setup() exits — Wi-Fi is optional.
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("[NETRA] WiFi connected");
    Serial.println("[NETRA] IP address  : " + WiFi.localIP().toString());
    configTime(GMT_OFFSET_SEC, DAYLIGHT_OFFSET_SEC, NTP_SERVER);
    Serial.println("[NETRA] NTP sync requested.");
  } else {
    Serial.println("\n[WARN]  Wi-Fi not connected. Local safety warning ACTIVE regardless.");
    Serial.println("[WARN]  Telemetry POST will be skipped until Wi-Fi is available.");
  }

  Serial.println("[NETRA] Setup complete. Entering local safety loop.\n");
}

// ============================================================
// SAFETY-STATE POLL + OLED-2 RENDER (Feature 11, Phase 1 + Phase 2)
// ============================================================
// Pure read-time client: GETs the safety message the backend already
// computed (esp.py -> blind_curve_state_service.py for curve state,
// v2v_engine.py for any vehicle conflict) and displays it. No blind-curve
// distance, TTC, or risk logic is computed on the ESP32 — the fields below
// are read verbatim from the Phase-1 compact contract
// (backend/app/schemas/esp_message.py).

// Parsed Phase-1 compact safety message (see esp_message.py):
//   vehicle_id, state, curve_id, distance_to_curve, vehicle_alert{...}
struct SafetyStatePayload {
  String state;                 // SAFE | UPCOMING_BLIND_CURVE | BLIND_CURVE_ACTIVE
  String curveId;                // BLIND_CURVE_01 | BLIND_CURVE_02 | ""
  bool   hasDistanceToCurve = false;
  float  distanceToCurve    = 0.0f;
  bool   hasVehicleAlert    = false;   // true only when the backend's existing
                                        // V2V engine reports an active conflict
  float  vehicleDistance    = 0.0f;
  bool   hasVehicleTtc      = false;
  float  vehicleTtc         = 0.0f;
};

// "BLIND_CURVE_01" -> "1", "BLIND_CURVE_02" -> "2", anything else -> "".
String curveNumberLabel(const String &curveId) {
  if (curveId.endsWith("01")) return "1";
  if (curveId.endsWith("02")) return "2";
  return "";
}

// Renders OLED-2 from the Phase-1 contract fields, in the required priority:
//   1. UPCOMING VEHICLE (only when the backend V2V engine actually reports one)
//   2. BLIND CURVE <n> ACTIVE
//   3. UPCOMING BLIND CURVE <n> (+ distance)
//   4. SAFE
void renderSafetyState(const SafetyStatePayload &s) {
  if (!oledReady) return;

  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setCursor(0, 0);

  if (s.hasVehicleAlert) {
    oled.setTextSize(1);
    oled.println("UPCOMING VEHICLE");
    oled.printf("%.1f m\n", s.vehicleDistance);
    if (s.hasVehicleTtc) {
      oled.printf("TTC %.1f s\n", s.vehicleTtc);
    }
  } else if (s.state == "BLIND_CURVE_ACTIVE") {
    oled.setTextSize(2);
    oled.print("BLIND CURVE ");
    oled.println(curveNumberLabel(s.curveId));
    oled.println("ACTIVE");
  } else if (s.state == "UPCOMING_BLIND_CURVE") {
    oled.setTextSize(1);
    oled.println("UPCOMING");
    oled.print("BLIND CURVE ");
    oled.println(curveNumberLabel(s.curveId));
    if (s.hasDistanceToCurve) {
      oled.printf("%.1f m\n", s.distanceToCurve);
    }
  } else {
    oled.setTextSize(2);
    oled.println("SAFE");
  }

  oled.display();
}

// Kept for back-compat with any consumer that only sends "hazard_state"
// (e.g. an older backend build). Displays the string verbatim.
void renderHazardState(const String &state) {
  if (!oledReady) return;
  oled.clearDisplay();
  oled.setTextColor(SSD1306_WHITE);
  oled.setTextSize(state.length() > 10 ? 1 : 2);
  oled.setCursor(0, 0);
  oled.println(state);
  oled.display();
}

void pollSafetyState() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.setTimeout(SAFETY_STATE_HTTP_TIMEOUT_MS);  // Phase 3: don't block loop() on a dead LAN link
  http.begin(SAFETY_STATE_ENDPOINT);
  int httpCode = http.GET();

  if (httpCode == 200) {
    if (!lastBackendReachable) {
      lastBackendReachable = true;
      Serial.println("[NETRA] Backend connected");
    }

    String body = http.getString();
    // Sized for the Phase-1 compact contract (state/curve_id/distance_to_curve
    // plus the nested vehicle_alert object and the back-compat fields esp.py
    // also includes).
    StaticJsonDocument<1536> doc;
    DeserializationError err = deserializeJson(doc, body);

    if (!err && doc.containsKey("upcoming_hazard")) {
      // ── Current hardware contract path ─────────────────────────────────
      // The backend is authoritative: ESP32 only maps the received state
      // to the OLED. No route-distance or hazard calculation happens here.
      JsonObject hazard = doc["upcoming_hazard"].as<JsonObject>();
      SafetyStatePayload s;

      String statusText = hazard["status"].as<String>();
      s.curveId = hazard["section_id"].isNull()
                    ? ""
                    : hazard["section_id"].as<String>();

      if (statusText == "ACTIVE") {
        s.state = "BLIND_CURVE_ACTIVE";
        s.hasDistanceToCurve = true;
        s.distanceToCurve = hazard["distance_m"].as<float>();
      } else if (statusText == "UPCOMING") {
        s.state = "UPCOMING_BLIND_CURVE";
        if (!hazard["distance_m"].isNull()) {
          s.hasDistanceToCurve = true;
          s.distanceToCurve = hazard["distance_m"].as<float>();
        }
      } else {
        s.state = "SAFE";
        s.curveId = "";
      }

      JsonObject vehicle = doc["approaching_vehicle"].as<JsonObject>();
      bool vehicleDetected = vehicle["detected"].as<bool>();
      if (vehicleDetected) {
        s.hasVehicleAlert = true;
        s.vehicleDistance = vehicle["distance_m"].isNull()
                              ? 0.0f
                              : vehicle["distance_m"].as<float>();
        if (!vehicle["ttc_s"].isNull()) {
          s.hasVehicleTtc = true;
          s.vehicleTtc = vehicle["ttc_s"].as<float>();
        }
      }

      String key = s.state + "|" + s.curveId + "|" +
                   (s.hasDistanceToCurve ? String(s.distanceToCurve, 1) : "-") + "|" +
                   (s.hasVehicleAlert ? "VEHICLE" : "-");
      if (key != lastHazardState) {
        lastHazardState = key;
        Serial.print("[NETRA] Safety state: ");
        Serial.println(s.state);
        Serial.print("[NETRA] Curve: ");
        Serial.println(s.curveId.length() ? s.curveId : "NONE");
        Serial.print("[NETRA] Distance: ");
        if (s.hasDistanceToCurve) {
          Serial.print(s.distanceToCurve, 1);
          Serial.println("m");
        } else {
          Serial.println("N/A");
        }
        Serial.print("[NETRA] Vehicle alert: ");
        if (s.hasVehicleAlert) {
          Serial.print(s.vehicleDistance, 1);
          Serial.print("m");
          if (s.hasVehicleTtc) {
            Serial.print(" TTC ");
            Serial.print(s.vehicleTtc, 1);
            Serial.print("s");
          }
          Serial.println();
        } else {
          Serial.println("NONE");
        }
      }

      renderSafetyState(s);

    } else if (!err && doc.containsKey("state")) {
      // ── Legacy compact contract path ───────────────────────────────────
      // Kept for compatibility with the previous backend build.
      SafetyStatePayload s;
      s.state   = doc["state"].as<String>();
      s.curveId = doc["curve_id"].isNull() ? "" : doc["curve_id"].as<String>();

      if (!doc["distance_to_curve"].isNull()) {
        s.hasDistanceToCurve = true;
        s.distanceToCurve = doc["distance_to_curve"].as<float>();
      }

      JsonVariant vehicleAlert = doc["vehicle_alert"];
      if (!vehicleAlert.isNull()) {
        s.hasVehicleAlert = true;
        if (!vehicleAlert["distance"].isNull()) {
          s.vehicleDistance = vehicleAlert["distance"].as<float>();
        }
        if (!vehicleAlert["ttc"].isNull()) {
          s.hasVehicleTtc = true;
          s.vehicleTtc = vehicleAlert["ttc"].as<float>();
        }
      }

      // Compact key used only to decide whether to log a change — the OLED
      // is always refreshed with the latest values, but Serial stays quiet
      // unless something actually changed (no continuous spam).
      String key = s.state + "|" + s.curveId + "|" +
                   (s.hasDistanceToCurve ? String(s.distanceToCurve, 1) : "-") + "|" +
                   (s.hasVehicleAlert ? "VEHICLE" : "-");
      if (key != lastHazardState) {
        lastHazardState = key;
        Serial.print("[NETRA] Safety state: ");
        Serial.println(s.state);
        Serial.print("[NETRA] Curve: ");
        Serial.println(s.curveId.length() ? s.curveId : "NONE");
        Serial.print("[NETRA] Distance: ");
        if (s.hasDistanceToCurve) {
          Serial.print(s.distanceToCurve, 1);
          Serial.println("m");
        } else {
          Serial.println("N/A");
        }
        Serial.print("[NETRA] Vehicle alert: ");
        if (s.hasVehicleAlert) {
          Serial.print(s.vehicleDistance, 1);
          Serial.print("m");
          if (s.hasVehicleTtc) {
            Serial.print(" TTC ");
            Serial.print(s.vehicleTtc, 1);
            Serial.print("s");
          }
          Serial.println();
        } else {
          Serial.println("NONE");
        }
      }

      renderSafetyState(s);
    } else if (!err && doc.containsKey("hazard_state")) {
      // ── Back-compat fallback: older response shape, string only ─────────
      String state = doc["hazard_state"].as<String>();
      if (state != lastHazardState) {
        lastHazardState = state;
        Serial.print("[HAZARD STATE] ");
        Serial.println(lastHazardState);
      }
      renderHazardState(state);
    } else {
      Serial.println("[WARN]  safety-state response missing/invalid fields.");
    }
  } else if (httpCode > 0) {
    if (lastBackendReachable) {
      lastBackendReachable = false;
      Serial.println("[WARN]  Backend unreachable (bad HTTP status)");
    }
    Serial.print("[WARN]  safety-state GET returned HTTP ");
    Serial.println(httpCode);
  } else {
    if (lastBackendReachable) {
      lastBackendReachable = false;
      Serial.println("[WARN]  Backend unreachable (connection/timeout)");
    }
    Serial.print("[ERROR] safety-state GET failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

// ============================================================
// LOOP — runs as fast as possible; no blocking delay()
// ============================================================

void loop() {
  // ── 1. Feed GPS parser (runs every iteration, regardless of Wi-Fi) ────────
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  // ── 2. Read proximity sensor (runs every iteration) ──────────────────────
  float obstacleM = readObstacleDistanceM();

  // ── 3. Local safety assessment + warning (runs every iteration) ──────────
  //       This is entirely independent of Wi-Fi and backend state.
  LocalSafetyLevel safetyLevel = classifyLocalSafety(obstacleM);
  updateLocalWarning(safetyLevel);

  // Serial log — only print when something changes or on the publish tick
  // to avoid flooding. Level-change logging is already done inside updateLocalWarning().
  // Here we log distance for traceability on each publish cycle.

  // ── 4. Telemetry POST — only when Wi-Fi is up and publish interval elapsed ─
  unsigned long now = millis();
  if (now - lastPublishMs < PUBLISH_INTERVAL_MS) {
    // Not time to publish yet — local safety above still runs.
    return;
  }
  lastPublishMs = now;

  // Log current local safety state with distance on each publish cycle
  switch (safetyLevel) {
    case LS_NORMAL:
      Serial.printf("[LOCAL SAFETY] NORMAL       distance=%.1fm\n", obstacleM);
      break;
    case LS_HIGH:
      Serial.printf("[LOCAL SAFETY] HIGH         distance=%.1fm\n", obstacleM);
      break;
    case LS_CRITICAL:
      Serial.printf("[LOCAL SAFETY] CRITICAL     distance=%.1fm\n", obstacleM);
      break;
    case LS_SENSOR_FAULT:
      Serial.println("[LOCAL SAFETY] SENSOR FAULT");
      break;
  }

  // ── Wi-Fi availability check ───────────────────────────────────────────────
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN]  Wi-Fi offline. Telemetry POST skipped. Local safety continues.");
    // Do NOT block or delay here. Local safety keeps running at the top of loop().
    return;
  }

  // ── Feature 11: poll ESP safety-state and refresh OLED ────────────────────
  pollSafetyState();

  // ── 5. GPS readings for telemetry ─────────────────────────────────────────
  bool   gpsValid   = gps.location.isValid() && gps.location.age() < 2000;
  double latitude   = gpsValid ? gps.location.lat()    : 22.1290;  // DEMO fallback
  double longitude  = gpsValid ? gps.location.lng()    : 82.1390;  // DEMO fallback
  double altitude   = gps.altitude.isValid() ? gps.altitude.meters() : 280.5;
  double gpsAccM    = gps.hdop.isValid()     ? gps.hdop.hdop() * 3.0 : 5.0;
  double speedKmh   = gps.speed.isValid()    ? gps.speed.kmph()      : 0.0;
  double heading    = gps.course.isValid()   ? gps.course.deg()      : 90.0;

  if (!gpsValid) {
    Serial.println("[DEMO]  GPS fix unavailable — using demo coordinate placeholder.");
  }

  String sensorStatus = getSensorStatus(gpsValid, obstacleM);
  String timestamp    = getISO8601Timestamp();
  if (timestamp == "1970-01-01T00:00:00Z") {
    Serial.println("[WARN]  NTP timestamp not available — using epoch placeholder.");
  }

  // ── 6. Build JSON telemetry payload ───────────────────────────────────────
  // The ESP32 MUST NOT include: ttc, risk_score, risk_level,
  // recommended_action, route_distance, section_id.
  // The backend (v2v_engine.py) is solely responsible for those.
  StaticJsonDocument<512> doc;
  doc["vehicle_id"]    = VEHICLE_ID;
  doc["timestamp"]     = timestamp;
  doc["latitude"]      = latitude;
  doc["longitude"]     = longitude;
  doc["altitude"]      = altitude;
  doc["gps_accuracy"]  = gpsAccM;
  doc["speed"]         = speedKmh;
  doc["heading"]       = heading;
  doc["sensor_status"] = sensorStatus;

  if (obstacleM > 0.0f) {
    doc["obstacle_distance"] = obstacleM;
  }

  String payload;
  serializeJson(doc, payload);

  // ── 7. POST to backend ────────────────────────────────────────────────────
  HTTPClient http;
  http.begin(HARDWARE_ENDPOINT);
  http.addHeader("Content-Type", "application/json");

  Serial.print("[NETRA] POST → " HARDWARE_ENDPOINT " | ");
  Serial.println(payload);

  int httpCode = http.POST(payload);

  if (httpCode > 0) {
    if (httpCode == 201) {
      Serial.println("[NETRA] ✓ Telemetry accepted by backend.");
    } else {
      Serial.print("[WARN]  Backend returned HTTP ");
      Serial.println(httpCode);
    }
  } else {
    Serial.print("[ERROR] HTTP POST failed: ");
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
  // loop() returns immediately; local safety resumes on next iteration.
}

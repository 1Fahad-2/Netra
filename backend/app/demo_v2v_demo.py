import os
import sys, pathlib
sys.path.append(str(pathlib.Path(__file__).resolve().parent.parent))
from app.core.config import settings
import requests
import time
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, text
from app.services.blind_curve_state_service import blind_curve_state_service

API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8000").strip()
API_URL = f"{API_BASE_URL}/api/telemetry"
print(f"[V2V DEMO] API_URL={API_URL}")
HEADERS = {"Content-Type": "application/json"}

# ---------------------------------------------------------------------------
# Step 1: Clean stale telemetry & alerts for the demo vehicles (HEMM-01, HEMM-02)
# ---------------------------------------------------------------------------

def reset_backend_state():
    db_url = settings.DATABASE_URL
    engine = create_engine(db_url)
    with engine.begin() as conn:
        # Delete telemetry events for demo vehicles
        conn.execute(text("DELETE FROM telemetry_events WHERE vehicle_id IN ('HEMM-01', 'HEMM-02')"))
        # Delete sensor health records for demo vehicles
        conn.execute(text("DELETE FROM sensor_health WHERE vehicle_id IN ('HEMM-01', 'HEMM-02')"))
        # Delete active alerts for demo vehicles (they will be recreated by the demo)
        conn.execute(text("DELETE FROM alerts WHERE vehicle_id IN ('HEMM-01', 'HEMM-02')"))
    # Clear the in-memory blind-curve hysteresis cache so a fresh demo run
    # always starts from a clean SAFE state regardless of what a previous run
    # left in the singleton's _last dict.
    blind_curve_state_service.reset()
    print("[demo] Backend state reset – stale telemetry, sensor health, alerts, and blind-curve state cleared.")

# ---------------------------------------------------------------------------
# Helper to send telemetry for a vehicle
# ---------------------------------------------------------------------------

def send(vehicle_id: str, telemetry: dict):
    # Ensure required fields are present and client‑authoritative fields are absent
    assert "route_distance" in telemetry, "route_distance missing in telemetry"
    assert "section_id" in telemetry, "section_id missing in telemetry"
    for field in ["risk_level", "risk_score", "ttc", "object_distance", "recommended_action"]:
        assert field not in telemetry, f"{field} should not be in demo payload"
    # Build payload explicitly with required fields only
    payload = {
        "vehicle_id": vehicle_id,
        "vehicle_type": telemetry["vehicle_type"],
        "timestamp": telemetry["timestamp"],
        "position": telemetry["position"],
        "heading": telemetry["heading"],
        "speed": telemetry["speed"],
        "visibility_condition": telemetry["visibility_condition"],
        "sensor_health": telemetry["sensor_health"],
        "network_status": telemetry["network_status"],
        "source_metadata": telemetry["source_metadata"],
        "data_mode": telemetry["data_mode"],
        "object_detected": telemetry["object_detected"],
        "route_distance": telemetry["route_distance"],
        "section_id": telemetry["section_id"]
    }
    print(f"[{vehicle_id}] final payload: {json.dumps(payload, indent=2)}")
    resp = requests.post(API_URL, json=payload, headers=HEADERS)
    print(f"[{vehicle_id}] {telemetry.get('timestamp')} -> {resp.status_code}")
    if resp.status_code == 201:
        try:
            data = resp.json()
            # Print only backend‑derived safety values
            distance = data.get('distance')
            closing = data.get('closing_speed')
            ttc = data.get('ttc')
            risk = data.get('risk_level')
            action = data.get('recommended_action')
            print(f"[{vehicle_id}] {resp.status_code} distance={distance}m closing={closing}m/s TTC={ttc}s risk={risk} action={action}")
        except Exception:
            pass
            try:
                print(f"Response body: {resp.json()}")
            except Exception:
                pass
    else:
        try:
            print(f"Response body: {resp.text}")
        except Exception:
            pass
    return resp


def iso_now(offset_seconds=0):
    return (datetime.now(timezone.utc) + timedelta(seconds=offset_seconds)).isoformat()

# ---------------------------------------------------------------------------
# Base telemetry template (fields common to both vehicles)
# ---------------------------------------------------------------------------
BASE_TELEMETRY = {
    "vehicle_type": "100T DUMPER",
    "timestamp": "",
    "position": {"latitude": 0.0, "longitude": 0.0, "altitude": 0},
    "heading": 0,
    "visibility_condition": "NORMAL",
    "sensor_health": {"radar": "HEALTHY", "thermal": "HEALTHY", "gnss": "HEALTHY", "imu": "HEALTHY"},
    "network_status": "ONLINE",
    "source_metadata": "demo_v2v",
    "data_mode": "LIVE",
    "object_detected": False,

    "route_distance": 0.0,
    "section_id": "S01",
}

# ---------------------------------------------------------------------------
# Demo phases (duration, speed for HEMM‑01, speed for HEMM‑02, description)
# ---------------------------------------------------------------------------
PHASES = [
    (8, 10.0, 10.0, "SAFE - equal speeds, safe gap"),
    (7, 25.0, 5.0, "WARNING - following faster to approach"),
    (5, 30.0, 5.0, "CRITICAL - rapid closing"),
    (11, 5.0, 20.0, "RECOVERY - gap increasing"),
]

# ---------------------------------------------------------------------------
# Main demo loop
# ---------------------------------------------------------------------------

def main():
    reset_backend_state()
    # Initial route distances: HEMM‑01 at 0 m, HEMM‑02 ahead by 80 m (baseline for demo)ve any warning threshold)
    route_dist_01 = 0.0
    route_dist_02 = 80.0
    current_time = 0
    for idx, (duration, speed_01, speed_02, desc) in enumerate(PHASES, 1):
        print(f"=== Phase {idx}: {desc} ({duration}s) ===")
        elapsed = 0
        while elapsed < duration:
            dt = 1  # 1‑second step
            # Use a single timestamp for both vehicles to allow V2VEngine to compute
            ts = iso_now(int(current_time))
            # Advance distances according to speed (m/s)
            # Convert speed from km/h to m/s for distance accumulation
            route_dist_01 += speed_01 * 1000 / 3600 * dt
            route_dist_02 += speed_02 * 1000 / 3600 * dt
            tele_01 = BASE_TELEMETRY.copy()
            tele_01.update({"timestamp": ts, "speed": speed_01, "route_distance": round(route_dist_01, 2), "section_id": "S01"})
            tele_02 = BASE_TELEMETRY.copy()
            tele_02.update({"timestamp": ts, "speed": speed_02, "route_distance": round(route_dist_02, 2), "section_id": "S01"})
            # Debug payload keys
            print(f"[DEBUG] HEMM-02 payload keys: {list(tele_02.keys())}")
            # Send telemetry for both vehicles
            resp1 = send("HEMM-01", tele_01)
            resp2 = send("HEMM-02", tele_02)
            # Verify payloads passed validation and print confirmation
            if resp1.status_code == 201:
                print("[PAYLOAD CHECK] HEMM-01 keys OK")
            if resp2.status_code == 201:
                print("[PAYLOAD CHECK] HEMM-02 keys OK")
            # Stop after first tick for both vehicles
# continue demo (removed early exit)
            # The following lines are unreachable after early return but kept for context
            time.sleep(dt)  # real‑time pacing (can be sped up for testing)
            elapsed += dt
            current_time += dt
        print(f"--- End of Phase {idx} ---\n")
    print("Demo completed.")

if __name__ == "__main__":
    try:
        print(f"[V2V DEMO] START")
        print(f"[V2V DEMO] API_BASE_URL={API_BASE_URL}")
        main()
    except Exception as e:
        print(f"[V2V DEMO] ERROR: {e}")
        raise

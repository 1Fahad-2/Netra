# Netra
**SIH 2026 | AI-Enhanced Haul-Road Safety & Collision Avoidance System**

Netra is a smart safety-assistance and monitoring system designed for **open-cast mining dumpers**. It combines vehicle tracking, multi-layer communication, proximity sensing, and Edge AI to identify hazardous situations and provide timely alerts.

🚧** Key Features**

* 📍 GPS-based vehicle tracking
* 📡 Internet, LoRa and nRF24 communication
* 🚗 Vehicle-to-Vehicle (V2V) safety communication
* 📏 VL53L0X Lidar ToF-based obstacle detection
* 🤖 Lightweight Edge-AI risk classification
* ⚠️ Safe / Caution / Hazard risk states
* 🔊 Local buzzer and visual alerts
* 🖥️ Live React command-center dashboard
* 🔄 FastAPI REST APIs and WebSocket telemetry
* 💾 Telemetry and alert-history storage
* 🛡️ Fail-safe operation during communication failures

🧠 **System Architecture**

GPS + Sensors
      │
      ▼
ESP32 / STM32 Edge Controller
      │
      ▼
Risk Assessment + Edge AI
      │
      ├───────────────┐
      ▼               ▼
Local Alerts     Communication
Buzzer / LED     Internet / LoRa / nRF24
      │               │
      └───────┬───────┘
              ▼
       Command Center
              │
              ▼
       React + FastAPI

🚦 **Risk Classification**

| State          | Example Condition                           | Response                              |
| -------------- | ------------------------------------------- | ------------------------------------- |
| 🟢 **Safe**    | Normal distance and communication           | Normal monitoring                     |
| 🟡 **Caution** | Reduced distance, blind curve or stale data | Warning / reduce speed                |
| 🔴 **Hazard**  | Critical proximity or communication failure | Emergency alert / stop recommendation |

🔧 **Hardware**

* ESP32 / STM32
* GPS module
* LoRa module
* nRF24L01
* VL53L0X ToF sensor
* Fog/environment sensors
* Buzzer and RGB LEDs
* Motor driver for prototype vehicle control

💻 **Technology Stack**

**Frontend:** React, TypeScript, Vite
**Backend:** Python, FastAPI, SQLAlchemy, WebSocket
**Edge:** ESP32 / STM32
**Communication:** GPS, Wi-Fi/Internet, LoRa, nRF24
**AI:** TFlite/ TinyML, Yolo

📁 **Project Structure**
Netra/
├── backend/       # FastAPI, database, WebSocket & telemetry
├── frontend/      # React command-center dashboard
├── docs/          # Architecture and documentation
├── scratch/       # Testing and experiments
└── README.md
```

🚀** Quick Start**

Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Frontend

```bash
cd frontend
npm install
npm run dev
```

Dashboard:

```text
http://127.0.0.1:5173
```

API:

```text
http://127.0.0.1:8000/docs
```

🔮 **Future Scope**

* RTK-GPS and industrial-grade positioning
* Radar / long-range LiDAR
* AI-based camera and thermal monitoring
* Driver-fatigue detection
* Road-condition monitoring
* Fleet-wide deployment
* GSM/SMS emergency notification

⚠️ **Disclaimer**

NETRA is an **SIH 2026 prototype** intended for research and demonstration. Real-world deployment requires industrial-grade hardware, extensive field testing, mine-specific validation, safety certification and regulatory approval.

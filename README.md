# 🚜 NETRA — Mining Safety Command Center

### AI-Enhanced Haul-Road Safety & Collision Avoidance System

**Smart India Hackathon (SIH) 2026 | Open-Cast Mining Safety**

<p align="center">

NETRA is a multi-layer safety-assistance system designed for open-cast mining haul roads, combining **vehicle sensing, Edge AI, sensor fusion, V2V communication, vehicle telemetry, local driver alerts, and a real-time command center**.

<br><br>

<a href="https://sih-2026-netra.vercel.app/#/command-center">
  <strong>🚀 OPEN LIVE NETRA COMMAND CENTER</strong>
</a>

</p>

---

# 🌐 Live Demo

## 🖥️ NETRA Command Center

### 🚀 [Open Live Command Center](https://sih-2026-netra.vercel.app/#/command-center)

The NETRA Command Center provides a centralized operator view of:

* 🚛 Vehicle locations
* ⚠️ Active safety alerts
* 📡 Communication status
* 📊 Vehicle telemetry
* 🛣️ Haul-road conditions
* 🔴 Risk levels
* 🚨 Incidents and alerts
* 🗺️ Fleet and route information

---

# 🎯 Problem Statement

Open-cast mining operations use large **Heavy Earth Moving Machinery (HEMM)** on haul roads where visibility, communication, and reaction time can become critical safety factors.

Major challenges include:

* 🌫️ Dense fog and reduced visibility
* 🛣️ Blind curves and restricted line-of-sight
* 🚛 Multiple heavy vehicles operating simultaneously
* 📡 Intermittent or unavailable communication
* ⚠️ Unexpected obstacles and vehicle proximity
* ⏱️ Limited reaction time during critical situations

NETRA addresses these challenges by creating a **multi-layer safety-assistance architecture** that combines local sensing and warning with centralized fleet monitoring.

---

# 💡 NETRA Solution

NETRA connects the vehicle, sensing layer, communication systems, backend, and command center into one safety ecosystem.

The system is designed around four major principles:

> **Sense → Assess → Communicate → Warn**

### Core Safety Pipeline

```text
Sensors
   │
   ▼
ESP32 / Edge Controller
   │
   ▼
Sensor Fusion & Risk Assessment
   │
   ├───────────────┬────────────────┐
   ▼               ▼                ▼
Local Alert       V2V             Telemetry
   │               │                │
   ▼               ▼                ▼
OLED / LED /    nRF24 / LoRa    FastAPI Backend
Buzzer                              │
                                    ▼
                             React Command Center
```

---

# 🏗️ System Architecture

The following architecture shows how NETRA connects vehicle sensors, ESP32, Edge AI, driver alerts, V2V communication, LoRa, the backend, database, and the command center.

<p align="center">
  <img src="docs/images/netra-architecture.png" alt="NETRA System Architecture" width="100%">
</p>

### Architecture Overview

The NETRA architecture consists of the following layers:

### 1. 🚛 Vehicle & Sensor Layer

The prototype vehicle collects information from multiple sensing and positioning modules, including:

* GPS
* LiDAR / distance sensing
* Radar
* Camera
* Vehicle telemetry

The collected information is passed to the embedded controller for processing.

### 2. 🧠 Edge AI Layer

The Edge AI layer performs local processing and supports:

* Sensor fusion
* Object detection
* Fog / visibility detection
* Risk assessment
* Local safety-state generation

This reduces dependence on continuous remote connectivity for immediate warning decisions.

### 3. 📡 Communication Layer

NETRA uses multiple communication mechanisms:

* **nRF24** — local vehicle-to-vehicle communication
* **LoRa** — long-range communication
* **Wi-Fi / Internet** — backend connectivity
* **WebSocket** — real-time dashboard updates

### 4. 🔔 Driver Interface

The vehicle provides local warnings through:

* OLED displays
* LED indicators
* Buzzer
* Safety-state information

The driver interface is designed to provide immediate awareness when a risk condition is detected.

### 5. 🖥️ Command Center

The command center receives vehicle and safety information through the backend and provides an operator-facing view of:

* Vehicle locations
* Alerts
* Risk conditions
* Fleet information
* Telemetry
* Route and blind-curve conditions

---

# 🚨 Key Features

## 🚛 Vehicle Monitoring

* GPS-based vehicle positioning
* Vehicle identification
* Vehicle telemetry
* Fleet monitoring
* Vehicle status tracking

## 🌫️ Hazard & Proximity Detection

NETRA's architecture can integrate:

* LiDAR / ToF sensing
* Radar
* Camera
* GPS
* Environmental / fog information
* Vehicle motion data

## 🧠 Edge Intelligence

Local processing allows the system to generate safety information close to the vehicle.

```text
Sensor Data
     ↓
Preprocessing
     ↓
Sensor Fusion
     ↓
Object / Hazard Detection
     ↓
Risk Assessment
     ↓
Safety State
```

## 📡 Multi-Layer Communication

| Communication    | Purpose                     |
| ---------------- | --------------------------- |
| nRF24L01         | Local V2V communication     |
| LoRa             | Long-range communication    |
| Wi-Fi / Internet | Backend connectivity        |
| WebSocket        | Real-time dashboard updates |

## 🔊 Driver Alerts

The prototype driver interface supports:

* 🟢 Safe indication
* 🟡 Caution indication
* 🔴 Hazard indication
* OLED information
* LED warning
* Audible buzzer

## 🖥️ Real-Time Command Center

The command center provides:

* 🗺️ Mine / haul-road visualization
* 🚛 Vehicle tracking
* ⚠️ Alert monitoring
* 📊 Telemetry
* 📡 Communication status
* 🚨 Incident information
* 🛣️ Blind-curve / route information

---

# ⚠️ Risk Classification

| State      | Example Condition                                        | System Response                                 |
| ---------- | -------------------------------------------------------- | ----------------------------------------------- |
| 🟢 SAFE    | Normal operating condition                               | Normal monitoring                               |
| 🟡 CAUTION | Reduced visibility, approaching risk, or stale telemetry | Driver warning / safety recommendation          |
| 🔴 HAZARD  | Critical proximity or high-risk condition                | Immediate local warning / safety recommendation |

> Thresholds can be configured according to the deployment environment and validated through field testing.

---

# 🤖 Edge AI & Sensor Fusion

NETRA uses an Edge AI-oriented architecture where sensor information can be combined before generating a safety state.

```text
                SENSOR INPUTS
                     │
       ┌─────────────┼─────────────┐
       ▼             ▼             ▼
     LiDAR          Radar        Camera
       │             │             │
       └─────────────┼─────────────┘
                     ▼
              Sensor Fusion
                     ↓
             Object Detection
                     ↓
              Risk Assessment
                     ↓
            Safety Classification
             /        |        \
            ▼         ▼         ▼
          SAFE     CAUTION    HAZARD
```

Potential safety parameters include:

* Distance
* Relative movement
* Closing speed
* Time-to-collision
* Vehicle speed
* Vehicle state
* Communication health
* Visibility conditions

---

# 📡 V2V & Communication

NETRA supports communication between vehicles and the command center through different communication layers.

```text
                    ┌──────────────┐
                    │    VEHICLE   │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
       nRF24             LoRa         Wi-Fi / Internet
          │                │                │
          ▼                ▼                ▼
        V2V          LoRa Gateway     FastAPI Backend
                                           │
                                           ▼
                                    React Dashboard
```

### nRF24L01

Used for local V2V communication between prototype vehicles.

### LoRa

Provides a long-range communication path for telemetry and safety information.

### Wi-Fi / Internet

Provides connectivity between the vehicle/backend infrastructure and the command center when network connectivity is available.

---

# 🚗 NETRA Hardware Prototype

## Front View

The following image shows the front view of the NETRA prototype vehicle.

<p align="center">
  <img src="docs/images/netra-hardware-front.jpg" alt="NETRA Hardware Front View" width="90%">
</p>

The prototype integrates:

* ESP32 controller
* Vehicle motors
* Motor driver
* Ultrasonic / distance sensing
* Camera module
* GPS
* Communication modules
* OLED display
* LED indicators
* Buzzer
* Battery system
* Supporting electronics

---

## Top View

The top view provides an overall layout of the embedded electronics and vehicle hardware.

<p align="center">
  <img src="docs/images/netra-hardware-top.jpg" alt="NETRA Hardware Top View" width="90%">
</p>

The prototype layout contains the embedded controller, power system, motor driver, sensing modules, communication modules, displays, warning components, and drive system.

---

# 🔄 Working Methodology

## Step 1 — Data Acquisition

The vehicle collects information from sensors and communication modules.

```text
GPS
LiDAR / ToF
Radar
Camera
Motion / Vehicle Data
Communication Modules
        │
        ▼
      ESP32
```

## Step 2 — Local Processing

The collected information is processed locally.

```text
Raw Sensor Data
      ↓
Preprocessing
      ↓
Sensor Fusion
      ↓
Object / Hazard Detection
      ↓
Risk Assessment
```

## Step 3 — Risk Evaluation

The system evaluates relevant safety parameters such as:

* Distance
* Relative movement
* Closing speed
* Time-to-collision
* Vehicle speed
* Visibility
* Communication status

## Step 4 — Local Safety Response

When a risk condition is detected:

```text
Risk Detected
     │
     ├─────────┬─────────┐
     ▼         ▼         ▼
   OLED       LED      Buzzer
     │         │         │
     └─────────┼─────────┘
               ▼
         Driver Warning
```

## Step 5 — Remote Monitoring

Vehicle information can also be transmitted to the backend.

```text
Vehicle
   ↓
Communication Layer
   ↓
FastAPI Backend
   ↓
Database
   ↓
WebSocket / REST API
   ↓
React Command Center
```

---

# 🖥️ Command Center

The command center acts as the operator-facing monitoring layer of NETRA.

### Dashboard Capabilities

* 🗺️ Mine / haul-road map
* 🚛 Vehicle locations
* ⚠️ Active alerts
* 📊 Vehicle telemetry
* 🚨 Incident information
* 📡 Communication status
* 🛣️ Route and blind-curve information
* 🔄 Real-time updates

### 🚀 Live Dashboard

<p align="center">

<a href="https://sih-2026-netra.vercel.app/#/command-center">
  <strong>OPEN NETRA COMMAND CENTER →</strong>
</a>

</p>

---

# 🛠️ Technology Stack

## Frontend

```text
React
TypeScript
Vite
Map-based Visualization
WebSocket
```

## Backend

```text
Python
FastAPI
SQLAlchemy
Alembic
REST APIs
WebSocket
```

## Embedded Systems

```text
ESP32
C / C++
GPS
LoRa
nRF24
OLED
Sensors
```

## AI / Computer Vision

```text
Edge AI
Sensor Fusion
Computer Vision
Object Detection
YOLO-based Vision Processing
```

---

# 📁 Project Structure

```text
Netra/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── constants/
│   │   ├── core/
│   │   ├── database/
│   │   ├── schemas/
│   │   ├── services/
│   │   └── websocket/
│   ├── migrations/
│   ├── scripts/
│   ├── tests/
│   ├── requirements.txt
│   └── README.md
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── data/
│   │   ├── hooks/
│   │   ├── map/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── styles/
│   │   ├── types/
│   │   └── utils/
│   ├── package.json
│   └── vite.config.ts
│
├── hardware/
│   └── esp32_hemm_telemetry/
│       └── esp32_hemm_telemetry.ino
│
├── docs/
│   └── images/
│       ├── netra-architecture.png
│       ├── netra-hardware-front.jpg
│       └── netra-hardware-top.jpg
│
├── package.json
├── package-lock.json
└── README.md
```

---

# 🚀 Quick Start

## 1. Clone Repository

```bash
git clone https://github.com/1Fahad-2/Netra.git
cd Netra
```

---

## 2. Backend Setup

```bash
cd backend
```

Create a virtual environment:

```bash
python -m venv venv
```

### Windows

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the backend:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

---

## 3. Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The dashboard will normally be available at:

```text
http://127.0.0.1:5173
```

---

# 🔌 Backend Communication

```text
ESP32 / Vehicle
      │
      ▼
Communication Layer
      │
      ▼
FastAPI Backend
      │
 ┌────┴────┐
 ▼         ▼
Database  WebSocket
             │
             ▼
       React Dashboard
```

The backend provides the communication layer between vehicle telemetry, stored information, and the real-time command center.

---

# 📊 End-to-End Data Flow

```text
┌──────────────────────┐
│ GPS / Sensors        │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ ESP32 Edge Layer     │
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│ Sensor Fusion &      │
│ Risk Assessment      │
└──────────┬───────────┘
           │
      ┌────┴─────┐
      ▼          ▼
   Local       Remote
   Safety      Telemetry
      │          │
      ▼          ▼
 OLED/LED/   Communication
  Buzzer          │
                  ▼
          FastAPI Backend
                  │
          ┌───────┴───────┐
          ▼               ▼
      Database        WebSocket
                          │
                          ▼
                  React Dashboard
```

---

# 🧪 Prototype Status

NETRA is an **SIH 2026 research and demonstration prototype** combining:

```text
Hardware
   +
Embedded Systems
   +
Sensor Fusion
   +
Edge Intelligence
   +
V2V Communication
   +
Vehicle Telemetry
   +
FastAPI Backend
   +
Database
   +
Real-Time React Dashboard
```

The prototype demonstrates the integration of **vehicle-level safety assistance and centralized fleet monitoring** for open-cast mining environments.

---

# 🔮 Future Scope

Potential future improvements include:

* 📍 RTK-GPS for higher positioning accuracy
* 📡 Industrial-grade communication systems
* 📡 Long-range radar / LiDAR
* 👁️ Advanced AI-based camera monitoring
* 🌡️ Thermal sensing
* 😴 Driver fatigue monitoring
* 🛣️ Road-condition monitoring
* 🚛 Fleet-scale deployment
* 📱 Emergency communication
* 🧠 Advanced sensor-fusion models
* ☁️ Historical fleet analytics
* 🔐 Industrial cybersecurity
* 🏭 Integration with mine-specific safety infrastructure

---

# ⚠️ Disclaimer

NETRA is an **SIH 2026 research and demonstration prototype**.

Real-world mining deployment would require:

* Industrial-grade hardware
* Extensive field testing
* Mine-specific validation
* Safety certification
* Regulatory compliance
* Environmental testing
* Reliability testing
* Fail-safe validation

**NETRA should not be treated as a certified autonomous vehicle-control or safety-critical system.**

---

# 👥 Team TVYOM

### NETRA — SIH 2026

The project combines work across:

| Area             | Responsibility                     |
| ---------------- | ---------------------------------- |
| Embedded Systems | ESP32, sensors & vehicle interface |
| AI / ML          | Risk assessment & Edge AI          |
| Computer Vision  | Camera-based hazard detection      |
| Backend          | FastAPI, database & WebSocket      |
| Frontend         | React command center               |
| Hardware         | Vehicle prototype & electronics    |
| Communication    | V2V, LoRa & telemetry              |

---

# 🏆 Smart India Hackathon 2026

NETRA is developed as part of **Smart India Hackathon (SIH) 2026**, focusing on intelligent safety assistance for open-cast mining haul-road operations.

---

# ⭐ NETRA

<p align="center">

### **Sense. Communicate. Warn. Protect.**

🚛 **Vehicle Safety**
📡 **V2V Communication**
🧠 **Edge Intelligence**
🖥️ **Live Command Center**

<br>

<a href="https://sih-2026-netra.vercel.app/#/command-center">
  🚀 <strong>EXPLORE THE LIVE NETRA COMMAND CENTER</strong>
</a>

</p>

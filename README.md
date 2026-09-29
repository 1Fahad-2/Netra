# 🚜 Netra

## AI-Enhanced Haul-Road Safety & Collision Avoidance System

**SIH 2026 | Smart Safety-Assistance and Monitoring System for Open-Cast Mining Dumpers**

Netra is an intelligent safety-assistance and monitoring system designed for **open-cast mining dumpers**. It combines **vehicle tracking, multi-layer communication, proximity sensing, Edge AI, and a real-time command center** to identify hazardous situations and provide timely safety alerts.

The system is designed to remain operational even when individual communication channels become unavailable by using multiple communication and safety layers.

---

## 📑 Table of Contents

* [Overview](#-overview)
* [Problem Statement](#-problem-statement)
* [Key Features](#-key-features)
* [System Architecture](#-system-architecture)
* [Working Methodology](#-working-methodology)
* [Risk Classification](#-risk-classification)
* [Hardware](#-hardware)
* [Technology Stack](#-technology-stack)
* [Communication Architecture](#-communication-architecture)
* [Edge AI](#-edge-ai)
* [Command Center](#-command-center)
* [Project Structure](#-project-structure)
* [Quick Start](#-quick-start)
* [Future Scope](#-future-scope)
* [Disclaimer](#-disclaimer)

---

# 📌 Overview

Mining haul roads can present challenging operating conditions such as:

* Dense fog and reduced visibility
* Blind curves and restricted line-of-sight
* Multiple heavy vehicles operating simultaneously
* Communication interruptions
* Obstacles and vehicles entering unsafe proximity
* Delayed awareness of hazardous situations

Netra addresses these challenges through a **multi-layer safety architecture** combining local sensing, Edge AI, vehicle-to-vehicle communication, long-range communication, and centralized monitoring.

---

# 🚨 Problem Statement

Open-cast mining operations involve large dumpers operating in dynamic and potentially low-visibility environments.

Conventional safety mechanisms may depend heavily on:

* Driver visibility
* Manual monitoring
* Single communication channels
* Fixed warning thresholds

A communication failure or poor visibility can reduce the time available to react to a hazardous situation.

Netra therefore provides an **additional intelligent safety layer** capable of locally detecting risks while simultaneously transmitting vehicle telemetry and alerts to a command center.

---

# 🚧 Key Features

### 📍 Vehicle Tracking

* GPS-based vehicle positioning
* Real-time vehicle location monitoring
* Vehicle identification and telemetry tracking

### 📡 Multi-Layer Communication

* Internet / Wi-Fi communication
* LoRa long-range communication
* nRF24-based local communication
* Vehicle-to-Vehicle (V2V) safety communication

### 📏 Proximity & Obstacle Detection

* VL53L0X LiDAR Time-of-Flight sensing
* Real-time obstacle-distance measurement
* Proximity-based risk assessment
* Support for environmental/fog sensing

### 🤖 Edge AI

* Lightweight risk-classification model
* Local inference on ESP32 / STM32
* Low-latency safety decisions
* Reduced dependence on cloud processing

### ⚠️ Risk Assessment

The system classifies the current operating condition into:

* 🟢 Safe
* 🟡 Caution
* 🔴 Hazard

### 🔊 Local Safety Alerts

* Buzzer alerts
* RGB LED indicators
* Visual warnings
* Prototype vehicle control interface

### 🖥️ Command Center

* Live React dashboard
* Real-time vehicle monitoring
* Telemetry visualization
* Alert history
* Vehicle status monitoring

### 🔄 Backend & Data

* FastAPI REST APIs
* WebSocket telemetry
* SQLAlchemy database integration
* Telemetry storage
* Alert-history storage

### 🛡️ Fail-Safe Operation

Netra is designed to maintain local safety functionality even when communication with the command center is interrupted.

---

# 🧠 System Architecture

```text
                         NETRA
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
     GPS + Sensors    Vehicle Data      Environment
          │                │              Sensors
          │                │                │
          └────────────────┼────────────────┘
                           ▼
                 ┌──────────────────┐
                 │ ESP32 / STM32    │
                 │ Edge Controller  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │ Risk Assessment  │
                 │   + Edge AI      │
                 └────────┬─────────┘
                          │
                 ┌────────┴────────┐
                 │                 │
                 ▼                 ▼
          Local Safety       Communication
             Layer                Layer
                 │                 │
          ┌──────┼──────┐    ┌────┼─────────────┐
          │      │      │    │    │             │
        Buzzer  LED   Vehicle  Wi-Fi/Internet  LoRa
                       Control       │          │
                                     │          │
                                     └────┬─────┘
                                          │
                                          ▼
                                  ┌───────────────┐
                                  │   Command     │
                                  │    Center     │
                                  │ React +       │
                                  │ FastAPI       │
                                  └───────────────┘
```

---

# 🔄 Working Methodology

## 1. Data Acquisition

The system continuously collects information from:

* GPS
* VL53L0X ToF sensor
* IMU / vehicle sensors
* Fog/environment sensors
* Communication modules

---

## 2. Local Processing

The ESP32 or STM32 Edge Controller processes the sensor information locally.

```text
Sensor Data
     ↓
Data Preprocessing
     ↓
Feature Extraction
     ↓
Risk Assessment
```

---

## 3. Edge AI Risk Classification

The extracted features are passed to a lightweight TinyML model.

```text
Sensor Features
      ↓
TinyML Model
      ↓
Risk State
```

The local AI decision allows the vehicle to respond without waiting for a cloud or command-center response.

---

## 4. Communication

Vehicle telemetry and safety information can be transmitted through multiple communication layers:

```text
                 Vehicle
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
      nRF24        LoRa       Internet
        │           │           │
        └───────────┼───────────┘
                    ▼
             Command Center
```

---

## 5. Local Alert

If a hazardous condition is detected, the vehicle can immediately generate a local warning.

```text
Hazard Detected
      ↓
┌─────┴─────┐
▼           ▼
Buzzer      RGB LED
```

For the prototype, the system can also interface with a motor driver for demonstrating vehicle-control responses.

---

# 🚦 Risk Classification

| State          | Example Condition                                 | System Response                       |
| -------------- | ------------------------------------------------- | ------------------------------------- |
| 🟢 **Safe**    | Normal distance and healthy communication         | Normal monitoring                     |
| 🟡 **Caution** | Reduced distance, blind curve, or stale telemetry | Warning / reduce speed                |
| 🔴 **Hazard**  | Critical proximity or communication failure       | Emergency alert / stop recommendation |

> Risk thresholds can be configured according to the deployment environment and validated during field testing.

---

# 🔧 Hardware

| Component                     | Purpose                                    |
| ----------------------------- | ------------------------------------------ |
| **ESP32**                     | Edge processing and wireless communication |
| **STM32**                     | Embedded processing / Edge AI              |
| **GPS Module**                | Vehicle positioning                        |
| **LoRa Module**               | Long-range communication                   |
| **nRF24L01**                  | Local V2V communication                    |
| **VL53L0X ToF**               | Short-range obstacle/proximity detection   |
| **Fog / Environment Sensors** | Environmental condition monitoring         |
| **Buzzer**                    | Audible warning                            |
| **RGB LEDs**                  | Visual risk indication                     |
| **Motor Driver**              | Prototype vehicle control                  |

---

# 💻 Technology Stack

### Frontend

```text
React
TypeScript
Vite
```

### Backend

```text
Python
FastAPI
SQLAlchemy
WebSocket
```

### Edge Computing

```text
ESP32
STM32
C/C++
```

### Communication

```text
GPS
Wi-Fi / Internet
LoRa
nRF24L01
V2V Communication
```

### AI / Computer Vision

```text
TensorFlow Lite
TinyML
YOLO
OpenCV
```

---

# 📡 Communication Architecture

Netra uses multiple communication technologies depending on the required range and operating conditions.

### nRF24L01

Used for short-range vehicle-to-vehicle communication in the prototype.

```text
Vehicle A
    │
    │ nRF24
    ▼
Vehicle B
```

### LoRa

Used for longer-range low-bandwidth communication.

```text
Vehicle
   │
   │ LoRa
   ▼
LoRa Gateway
   │
   ▼
Command Center
```

### Internet / Wi-Fi

Used for communication between vehicles, backend services, and the live command center when network connectivity is available.

```text
Vehicle
   │
   │ Wi-Fi / Internet
   ▼
FastAPI Backend
   │
   ▼
React Dashboard
```

---

# 🤖 Edge AI

Netra uses lightweight AI models designed for deployment on resource-constrained embedded hardware.

### AI Pipeline

```text
Sensor Data
     ↓
Preprocessing
     ↓
Feature Extraction
     ↓
TinyML Model
     ↓
Risk Classification
     ↓
Local Safety Response
```

### Example Inputs

Depending on the deployed model, the system can use parameters such as:

```text
Distance
Closing Speed
Time-to-Collision
Acceleration
Gyroscope
Acceleration Magnitude
Gyroscope Magnitude
Communication Status
```

### Model Output

```text
SAFE
CAUTION
HAZARD
```

The Edge AI component is intended to provide **fast local inference** while reducing dependence on continuous cloud connectivity.

---

# 🖥️ Command Center

The Netra command center provides a centralized interface for monitoring the mining fleet.

### Dashboard Capabilities

* Live vehicle locations
* Vehicle status
* Risk status
* Telemetry
* Communication status
* Active alerts
* Historical alerts
* WebSocket-based live updates

### Architecture

```text
                 ┌──────────────────┐
                 │   Edge Vehicles  │
                 └────────┬─────────┘
                          │
                          ▼
                 ┌──────────────────┐
                 │   FastAPI        │
                 │   Backend        │
                 └────────┬─────────┘
                          │
                    WebSocket/API
                          │
                          ▼
                 ┌──────────────────┐
                 │ React Dashboard  │
                 └──────────────────┘
```

---

# 📁 Project Structure

```text
Netra/
│
├── backend/
│   ├── app/
│   ├── models/
│   ├── database/
│   ├── api/
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.ts
│
├── firmware/
│   ├── esp32/
│   ├── stm32/
│   ├── nrf24/
│   └── lora/
│
├── ai/
│   ├── dataset/
│   ├── training/
│   ├── models/
│   └── preprocessing/
│
├── computer_vision/
│   ├── yolo/
│   └── camera/
│
├── hardware/
│   ├── circuits/
│   ├── pcb/
│   └── schematics/
│
├── docs/
│   ├── architecture/
│   ├── diagrams/
│   └── images/
│
├── scratch/
│   └── experiments/
│
└── README.md
```

---

# 🚀 Quick Start

## Backend

Create and activate a Python virtual environment:

```bash
cd backend

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

Start the FastAPI server:

```bash
python -m uvicorn app.main:app --reload
```

### API

```text
http://127.0.0.1:8000
```

### Swagger API Documentation

```text
http://127.0.0.1:8000/docs
```

---

# 🌐 Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

The dashboard will be available at:

```text
http://127.0.0.1:5173
```

---

# 📊 Data Flow

The complete data flow can be summarized as:

```text
┌─────────────────┐
│ GPS / Sensors   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ ESP32 / STM32   │
└────────┬────────┘
         ▼
┌─────────────────┐
│ Edge AI         │
│ Risk Assessment │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
 Local       Remote
 Safety      Telemetry
    │         │
    ▼         ▼
Buzzer/LED  Communication
              │
              ▼
       FastAPI Backend
              │
              ▼
       React Dashboard
```

---

# 🔮 Future Scope

Future development may include:

* 📍 RTK-GPS for high-precision positioning
* 📡 Industrial-grade long-range communication
* 📡 Radar / long-range LiDAR
* 👁️ AI-based camera monitoring
* 🌡️ Thermal monitoring
* 😴 Driver-fatigue detection
* 🛣️ Road-condition monitoring
* 🚛 Fleet-wide deployment
* 📱 GSM/SMS emergency notifications
* 🧠 Advanced sensor-fusion models
* ☁️ Historical fleet analytics
* 🔐 Industrial-grade cybersecurity
* 🏭 Mine-specific safety integration

---

# 🧪 Prototype Status

Netra is being developed as an **SIH 2026 prototype** integrating:

```text
Hardware
   +
Embedded Systems
   +
Edge AI
   +
V2V Communication
   +
Computer Vision
   +
Backend
   +
Live Dashboard
```

Individual components are being tested independently before integration into the complete system.

---

# ⚠️ Disclaimer

**NETRA is an SIH 2026 prototype intended for research, educational, and demonstration purposes.**

Real-world deployment in mining environments requires:

* Industrial-grade hardware
* Extensive field testing
* Mine-specific validation
* Safety certification
* Regulatory compliance
* Environmental testing
* Reliability and fail-safe validation

The prototype should **not be treated as a certified autonomous vehicle-control or safety-critical system**.

---

# 👥 Team

### Team Netra

| Role             | Responsibility                         |
| ---------------- | -------------------------------------- |
| Embedded Systems | ESP32 / STM32 firmware and sensors     |
| AI / ML          | Edge AI and risk classification        |
| Computer Vision  | YOLO / camera-based detection          |
| Backend          | FastAPI, database and WebSocket        |
| Frontend         | React command center                   |
| Hardware         | Circuit, PCB and prototype integration |
| Communication    | LoRa / nRF24 / V2V / V2I                    |

---

# ⭐ Acknowledgement

Developed as part of **Smart India Hackathon (SIH) 2026** with the aim of exploring an intelligent, multi-layer safety architecture for open-cast mining haul-road operations.

---

## 📜 License

This project is currently intended for research and demonstration purposes.

Add your preferred open-source license here when the repository licensing decision is finalized.

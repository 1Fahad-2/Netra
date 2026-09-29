# MachineMind — Mining Safety Command Center
### SIH 2026 AI-Enhanced Haul-Road Safety & Collision Avoidance System

Industrial Command Center for open-cast iron-ore mining operations (Bailadila pit corridor).

---

## Repository Structure

```
MachineMind/
│
├── backend/                  # Python 3.12+ FastAPI backend service
│   ├── app/                  # REST APIs, WebSocket stream, SQLAlchemy persistence
│   ├── migrations/           # Alembic database migrations
│   └── requirements.txt      # Python dependencies
│
├── frontend/                 # React 19 + TypeScript + Vite frontend application
│   ├── src/                  # Command Center pages, 3D Map, telemetry hooks, services
│   ├── public/               # Static icons and assets
│   └── package.json          # Node dependencies & build scripts
│
├── docs/                     # Architectural specifications & problem documentation
├── scratch/                  # Test scripts and browser verification artifacts
└── README.md                 # Root repository guide
```

---

## Quick Start

### 1. Backend Service (FastAPI)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

- REST API Docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- WebSocket Stream: `ws://127.0.0.1:8000/ws/telemetry`
- Health Check: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

### 2. Frontend Application (React Command Center)

```bash
cd frontend
npm install
npm run dev
```

- Web UI: [http://127.0.0.1:5173/](http://127.0.0.1:5173/)

---

## Running Verification Tests

```bash
# Backend & End-to-End Persistence/WebSocket Tests
cd backend
python -u test_cp8_e2e.py
python -u test_cp7_websocket.py
python -u test_cp6_persistence.py
python -u test_database.py
python -u test_api.py

# Frontend Build & Type Check
cd frontend
npm run build
```

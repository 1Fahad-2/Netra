# MachineMind — Backend Foundation & PostgreSQL Persistence (Checkpoint 5)

FastAPI REST service backed by a **PostgreSQL persistence layer** using **SQLAlchemy 2.x** and **Alembic migrations** for the MachineMind Open-Cast Mining Safety Command Center.

---

## 1. Architectural Overview & Boundaries

```
API Route (FastAPI)
       │
       ▼
Service Layer (TelemetryService)
       │
       ▼
Repositories (VehicleRepository, TelemetryRepository, AlertRepository, etc.)
       │
       ▼
SQLAlchemy 2.x ORM / Core
       │
       ▼
PostgreSQL Database
```

### Strict Architectural Boundaries
1. **Persistent Storage (CP5)**: Replaces the temporary Checkpoint 4 in-memory buffer with durable PostgreSQL storage.
2. **Append-Only Telemetry**: Historical telemetry records are strictly append-only; historical entries are never updated or overwritten in-place.
3. **No Direct Frontend-to-Database Connection**: The React Vite dashboard communicates exclusively with the FastAPI REST backend.
4. **CP6 Horizon Notice**: High-frequency live ingestion pipelines will connect directly to PostgreSQL in Checkpoint 6.
5. **CP7 Horizon Notice**: WebSocket real-time streaming is deferred to Checkpoint 7.
6. **No AI/ML or Edge Hardware**: Strictly deterministic validation, proximity alerts, and operational audit logging.
7. **Exactly 2 Prototype Vehicles**: Strictly `HEMM-01` (100T Dumper Following) and `HEMM-02` (100T Dumper Lead). Zero fleet inflation.

---

## 2. Environment Configuration

Copy the configuration template:

```bash
cp .env.example .env
```

### Environment Variables
| Variable | Description | Example / Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (SQLAlchemy 2.x + psycopg 3) | `postgresql+psycopg://postgres:password@localhost:5432/machinemind` |
| `PROJECT_NAME` | Service title | `"MachineMind Mining Safety Command Center API"` |
| `VERSION` | API version string | `"0.1.0"` |
| `CHECKPOINT` | Active development checkpoint | `"CHECKPOINT_5_DATABASE_FOUNDATION"` |
| `HOST` | Backend bind host | `"127.0.0.1"` |
| `PORT` | Backend bind port | `8000` |
| `ALLOWED_ORIGINS` | Comma-separated CORS origins | `"http://localhost:5173,http://127.0.0.1:5173"` |

> [!NOTE]
> For security, never commit production database passwords or credentials to version control.

---

## 3. Database Schema Overview

The database layer consists of 5 relational tables defined in `app/database/models.py`:

### 1. `vehicles`
- **Purpose**: Stable identity and status registry for prototype HEMM machines.
- **Fields**: `id` (PK), `vehicle_id` (Unique, indexed), `vehicle_type`, `status`, `data_provenance`, `registered_at`, `updated_at`.
- **Seeded Fleet**: Strictly seeded with `HEMM-01` and `HEMM-02`.

### 2. `telemetry_events` (Append-Only)
- **Purpose**: Durable time-series audit trail of vehicle position, velocity, sensor health, and risk assessments.
- **Fields**: `id` (PK BigInt), `vehicle_id` (FK to `vehicles.vehicle_id`), `timestamp` (UTC), `latitude`, `longitude`, `altitude`, `heading`, `speed`, `visibility_condition`, `object_detected`, `object_type`, `object_distance`, `relative_speed`, `ttc`, `risk_score`, `risk_level`, `recommended_action`, `sensor_radar`, `sensor_thermal`, `sensor_gnss`, `sensor_imu`, `network_status`, `data_mode`, `source_metadata`, `created_at`.
- **Indexes**:
  - `ix_telemetry_events_vehicle_id` on `vehicle_id`
  - `ix_telemetry_events_timestamp` on `timestamp`
  - `idx_telemetry_risk_level` on `risk_level`
  - `idx_telemetry_vehicle_timestamp` composite index on `(vehicle_id, timestamp)`

### 3. `alerts`
- **Purpose**: Persists safety incidents and collision proximity advisories separately from raw telemetry.
- **Fields**: `id` (PK, e.g. `ALT-XXXXXXXX`), `vehicle_id` (FK to `vehicles.vehicle_id`), `severity` (`CRITICAL`, `WARNING`, `INFO`), `title`, `reason`, `timestamp` (UTC), `relative_time`, `latitude`, `longitude`, `status` (`ACTIVE`, `RESOLVED`), `created_at`.
- **Indexes**: `vehicle_id`, `timestamp`.

### 4. `sensor_health`
- **Purpose**: Persists individual sensor diagnostic snapshots for future hardware diagnostics.
- **Fields**: `id` (PK), `vehicle_id` (FK), `timestamp`, `radar`, `thermal`, `gnss`, `imu`, `created_at`.

### 5. `system_events`
- **Purpose**: Audit logging for edge operations (`NETWORK_OFFLINE`, `NETWORK_ONLINE`, `SENSOR_FAILURE`, `SENSOR_RECOVERY`, `BUFFER_SYNC`).
- **Fields**: `id` (PK), `vehicle_id` (FK nullable), `event_type`, `message`, `timestamp`, `event_metadata` (JSONB on PostgreSQL / JSON on SQLite), `created_at`.

---

## 4. Alembic Migrations & Seeding

### Apply Migrations
To initialize the database schema and seed the prototype fleet on a fresh PostgreSQL instance:

```bash
cd backend
alembic upgrade head
```

### Rollback Migrations
```bash
alembic downgrade -1
```

### Deterministic Seeding
Migration `0001_initial_schema.py` automatically seeds strictly `HEMM-01` and `HEMM-02`. If seeding is invoked via `VehicleRepository.seed_prototypes(db)`, it idempotently verifies the prototypes exist without duplicating or adding unauthorized vehicles.

---

## 5. Running the Backend Service

```bash
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- **Swagger Documentation**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- **ReDoc Documentation**: [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc)
- **Health & DB Status**: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

---

## 6. Automated Testing & Verification

### Database Foundation Tests (15 Criteria)
Runs the 15-point verification suite in an isolated test database:

```bash
cd backend
python -u test_database.py
```

Checks verified:
1. Engine connection & `SELECT 1` execution
2. Alembic migration execution to `head`
3. Table existence (`vehicles`, `telemetry_events`, `alerts`, `sensor_health`, `system_events`)
4. Fleet cardinality (exactly 2)
5. `HEMM-01` presence and attributes
6. `HEMM-02` presence and attributes
7. Absence of unauthorized third vehicles
8. Telemetry ingestion into append-only table
9. Retention of multiple telemetry events for the same vehicle
10. Preservation of historical telemetry (append-only ledger)
11. Persistence of safety alerts
12. Persistence of sensor health snapshots
13. Persistence of system events with metadata
14. Navigation of foreign key relationships on models
15. Rejection of unregistered vehicle references by foreign key constraints

### API Regression Tests
```bash
cd backend
python -u test_api.py
```
Verifies all 8 REST endpoints, schema validation, 404/422 responses, and `/health` reporting.

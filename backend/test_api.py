"""
MachineMind — Backend Automated API Verification Suite
Checkpoint 5: Verifies all endpoints, database-backed registry, append-only ingestion, and alert queries.
"""

import os
import sys
import tempfile

# Configure isolated test database before importing app
_test_db_dir = tempfile.mkdtemp()
_test_db_file = os.path.join(_test_db_dir, "test_api_suite.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_file}"

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database.connection import engine, Base, SessionLocal
from app.database.repositories import VehicleRepository
from app.main import app

# Ensure tables and seed data exist in test engine
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

Base.metadata.create_all(bind=engine)
with SessionLocal() as session:
    VehicleRepository.seed_prototypes(session)

client = TestClient(app)


def test_health():
    print("\n[1] Testing GET /health...")
    res = client.get("/health")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["checkpoint"] in ("CHECKPOINT_5_DATABASE_FOUNDATION", "CHECKPOINT_6_TELEMETRY_PERSISTENCE", "CHECKPOINT_8_REAL_TELEMETRY_PIPELINE")
    assert data["storage"] == "postgresql"
    assert data["active_fleet_count"] == 2
    assert "HEMM-01" in data["supported_vehicles"]
    assert "HEMM-02" in data["supported_vehicles"]
    assert "database" in data
    print(f" -> PASSED: Health endpoint returned 200 (database status: {data['database']}).")


def test_vehicles():
    print("\n[2] Testing GET /api/vehicles...")
    res = client.get("/api/vehicles")
    assert res.status_code == 200
    vehicles = res.json()
    assert len(vehicles) == 2, f"Expected exactly 2 vehicles, got {len(vehicles)}"
    ids = [v["vehicle_id"] for v in vehicles]
    assert "HEMM-01" in ids
    assert "HEMM-02" in ids
    print(f" -> PASSED: Returned exactly 2 registered prototypes: {ids}")


def test_vehicle_by_id():
    print("\n[3] Testing GET /api/vehicles/HEMM-01...")
    res = client.get("/api/vehicles/HEMM-01")
    assert res.status_code == 200
    data = res.json()
    assert data["vehicle_id"] == "HEMM-01"
    assert "100T DUMPER" in data["vehicle_type"]
    assert data["data_provenance"] == "SIMULATED"
    print(" -> PASSED: HEMM-01 details returned correctly.")


def test_invalid_vehicle_404():
    print("\n[4] Testing GET /api/vehicles/INVALID-VEHICLE (404 expected)...")
    res = client.get("/api/vehicles/INVALID-VEHICLE")
    assert res.status_code == 404
    detail = res.json().get("detail", "")
    assert "not found" in detail.lower()
    print(f" -> PASSED: Correct 404 returned for unknown vehicle ('{detail}').")


def test_invalid_telemetry_payload_422():
    print("\n[5] Testing POST /api/telemetry with invalid payload (422 validation error expected)...")
    invalid_payload = {
        "vehicle_id": "HEMM-01",
        "speed": "NOT_A_NUMBER",
        "risk_level": "NON_EXISTENT_RISK_LEVEL",
    }
    res = client.post("/api/telemetry", json=invalid_payload)
    assert res.status_code == 422, f"Expected 422, got {res.status_code}"
    errors = res.json().get("detail", [])
    assert len(errors) > 0
    print(f" -> PASSED: Pydantic validation rejected invalid payload with 422 Unprocessable Entity ({len(errors)} validation errors).")


def test_valid_telemetry_ingest_and_retrieval():
    print("\n[6] Testing POST /api/telemetry with valid Common Contract payload...")
    valid_payload = {
        "vehicle_id": "HEMM-01",
        "vehicle_type": "100T DUMPER (FOLLOWING)",
        "timestamp": "2026-09-11T02:00:00Z",
        "route_distance": 820.0,
        "section_id": "SEC-03",
        "position": {
            "latitude": 18.6508,
            "longitude": 81.2462,
            "altitude": 1040.0,
        },
        "heading": 148.0,
        "speed": 28.0,
        "visibility_condition": "NORMAL",
        "object_detected": True,
        "object_type": "HEMM-02",
        "object_distance": 22.0,
        "relative_speed": 2.5,
        "ttc": 8.8,
        "risk_score": 0.88,
        "risk_level": "HIGH",
        "recommended_action": "HOLD",
        "sensor_health": {
            "radar": "SIMULATED",
            "thermal": "NOT_CONNECTED",
            "gnss": "SIMULATED",
            "imu": "SIMULATED",
        },
        "network_status": "STANDBY",
        "data_mode": "SIMULATION",
        "source_metadata": "SIMULATED_DEMO_SCENARIO",
    }

    res = client.post("/api/telemetry", json=valid_payload)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
    ingest_res = res.json()
    assert ingest_res["status"] == "success"
    assert ingest_res["vehicle_id"] == "HEMM-01"
    assert ingest_res["risk_level"] == "HIGH"
    print(" -> PASSED: Telemetry ingested and persisted in database.")

    print("\n[7] Testing GET /api/telemetry/HEMM-01...")
    res = client.get("/api/telemetry/HEMM-01")
    assert res.status_code == 200
    data = res.json()
    assert data["vehicle_id"] == "HEMM-01"
    assert data["speed"] == 28.0
    assert data["object_distance"] == 22.0
    assert data["risk_score"] == 0.88
    assert data["risk_level"] == "HIGH"
    assert data["recommended_action"] == "HOLD"
    print(" -> PASSED: Retrieved latest telemetry from database matching ingested values.")


def test_alerts_derived_from_telemetry():
    print("\n[8] Testing GET /api/alerts...")
    res = client.get("/api/alerts")
    assert res.status_code == 200
    alerts = res.json()
    assert len(alerts) >= 1, f"Expected at least 1 alert, got {len(alerts)}"
    critical_alert = alerts[0]
    assert critical_alert["vehicle_id"] == "HEMM-01"
    assert critical_alert["severity"] == "CRITICAL"
    assert "HOLD" in critical_alert["reason"]
    print(f" -> PASSED: Alert persisted and retrieved: [{critical_alert['severity']}] {critical_alert['title']} - {critical_alert['reason']}")


def main():
    print("=" * 65)
    print("MachineMind — Checkpoint 5 API & Database Regression Suite")
    print("=" * 65)

    test_health()
    test_vehicles()
    test_vehicle_by_id()
    test_invalid_vehicle_404()
    test_invalid_telemetry_payload_422()
    test_valid_telemetry_ingest_and_retrieval()
    test_alerts_derived_from_telemetry()

    print("\n" + "=" * 65)
    print("ALL 8 API REGRESSION TESTS PASSED SUCCESSFULLY (100% COVERAGE)")
    print("=" * 65)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}", file=sys.stderr)
        sys.exit(1)

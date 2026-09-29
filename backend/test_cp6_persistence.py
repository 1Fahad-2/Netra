"""
MachineMind — Checkpoint 6: Telemetry API Persistence Verification Suite
Tests the complete persistence boundary:
1. Valid POST returns HTTP 201.
2. POST actually creates a row in telemetry_events.
3. GET latest returns the persisted telemetry.
4. Multiple telemetry events are preserved.
5. Historical events are not overwritten.
6. Latest event is selected using: timestamp DESC, id DESC.
7. History endpoint returns persisted events newest first.
8. POST with HEMM-999 returns HTTP 404.
9. GET with HEMM-999 returns HTTP 404.
10. Invalid payload returns HTTP 422.
11. Database failure never produces HTTP 201.
12. data_mode and source_metadata survive persistence and retrieval unchanged.
"""

import os
import sys
import tempfile
from datetime import datetime, timezone
from unittest.mock import patch

# Configure isolated test database before importing app
_temp_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_temp_dir, "test_cp6_isolated.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

from fastapi.testclient import TestClient
from sqlalchemy import event, select, func

from app.database.connection import engine, Base, SessionLocal
from app.database.models import Vehicle, TelemetryEvent
from app.database.repositories import VehicleRepository, TelemetryRepository
from app.main import app

# Enable foreign keys on SQLite test engine
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

# Initialize schema and seed prototypes
Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    VehicleRepository.seed_prototypes(db)

client = TestClient(app)


def run_cp6_tests():
    print("======================================================================")
    print("MACHINEMIND CHECKPOINT 6: TELEMETRY API PERSISTENCE VERIFICATION")
    print("======================================================================")
    print(f"Isolated Test Database: {os.environ['DATABASE_URL']}")

    passed_criteria = 0

    # ------------------------------------------------------------------
    # 1. Valid POST returns HTTP 201
    # ------------------------------------------------------------------
    print("\n[Criterion 1/12] Testing POST /api/telemetry with valid payload...")
    payload_t1 = {
        "vehicle_id": "HEMM-01",
        "vehicle_type": "100T DUMPER (FOLLOWING)",
        "timestamp": "2026-09-11T10:00:00Z",
        "position": {
            "latitude": 18.6750,
            "longitude": 81.2500,
            "altitude": 620.0,
        },
        "heading": 45.0,
        "speed": 24.5,
        "visibility_condition": "NORMAL",
        "object_detected": True,
        "object_type": "HEMM-02",
        "object_distance": 55.0,
        "relative_speed": -2.0,
        "ttc": 15.2,
        "risk_score": 0.25,
        "risk_level": "LOW",
        "recommended_action": "PROCEED",
        "sensor_health": {
            "radar": "HEALTHY",
            "thermal": "HEALTHY",
            "gnss": "HEALTHY",
            "imu": "HEALTHY",
        },
        "network_status": "ONLINE",
        "data_mode": "SIMULATION",
        "source_metadata": "HEMM SIMULATOR • DETERMINISTIC SCENARIO",
    }
    res1 = client.post("/api/telemetry", json=payload_t1)
    assert res1.status_code == 201, f"Expected 201, got {res1.status_code}: {res1.text}"
    body1 = res1.json()
    assert body1["status"] == "success"
    assert body1["vehicle_id"] == "HEMM-01"
    assert "CP6" in body1["message"] or "persisted" in body1["message"].lower()
    print("  -> PASSED: Valid POST returned HTTP 201 Created with confirmation.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 2. POST actually creates a row in telemetry_events
    # ------------------------------------------------------------------
    print("\n[Criterion 2/12] Verifying physical row creation in telemetry_events table...")
    with SessionLocal() as db:
        count = db.scalar(select(func.count(TelemetryEvent.id)).where(TelemetryEvent.vehicle_id == "HEMM-01"))
        assert count == 1, f"Expected 1 row in telemetry_events, found {count}"
        row = db.scalars(select(TelemetryEvent).where(TelemetryEvent.vehicle_id == "HEMM-01")).first()
        assert row is not None
        assert row.speed == 24.5
        assert row.risk_level == "LOW"
    print("  -> PASSED: Row exists in telemetry_events table with matching fields.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 3. GET latest returns the persisted telemetry
    # ------------------------------------------------------------------
    print("\n[Criterion 3/12] Testing GET /api/telemetry/HEMM-01 for persisted telemetry...")
    get_res = client.get("/api/telemetry/HEMM-01")
    assert get_res.status_code == 200, f"Expected 200, got {get_res.status_code}"
    telemetry_out = get_res.json()
    assert telemetry_out["vehicle_id"] == "HEMM-01"
    assert telemetry_out["speed"] == 24.5
    assert telemetry_out["position"]["latitude"] == 18.6750
    assert telemetry_out["position"]["longitude"] == 81.2500
    assert telemetry_out["risk_level"] == "LOW"
    assert telemetry_out["recommended_action"] == "PROCEED"
    print("  -> PASSED: GET /api/telemetry/HEMM-01 retrieved matching persisted telemetry.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 4. Multiple telemetry events are preserved
    # ------------------------------------------------------------------
    print("\n[Criterion 4/12] Ingesting second telemetry event and verifying preservation...")
    payload_t2 = {
        "vehicle_id": "HEMM-01",
        "vehicle_type": "100T DUMPER (FOLLOWING)",
        "timestamp": "2026-09-11T10:00:05Z",
        "position": {
            "latitude": 18.6758,
            "longitude": 81.2508,
            "altitude": 622.0,
        },
        "heading": 48.0,
        "speed": 16.0,
        "visibility_condition": "DEGRADED",
        "object_detected": True,
        "object_type": "HEMM-02",
        "object_distance": 25.0,
        "relative_speed": -4.0,
        "ttc": 6.2,
        "risk_score": 0.85,
        "risk_level": "HIGH",
        "recommended_action": "HOLD",
        "sensor_health": {
            "radar": "HEALTHY",
            "thermal": "WARNING",
            "gnss": "HEALTHY",
            "imu": "HEALTHY",
        },
        "network_status": "ONLINE",
        "data_mode": "PHYSICAL_TESTBED",
        "source_metadata": "ESP32 • SENSOR TELEMETRY",
    }
    res2 = client.post("/api/telemetry", json=payload_t2)
    assert res2.status_code == 201
    with SessionLocal() as db:
        count_after = db.scalar(select(func.count(TelemetryEvent.id)).where(TelemetryEvent.vehicle_id == "HEMM-01"))
        assert count_after == 2, f"Expected 2 rows in telemetry_events, found {count_after}"
    print(f"  -> PASSED: Multiple telemetry events preserved (total rows = {count_after}).")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 5. Historical events are not overwritten
    # ------------------------------------------------------------------
    print("\n[Criterion 5/12] Verifying historical telemetry is strictly append-only (not overwritten)...")
    with SessionLocal() as db:
        all_events = db.scalars(
            select(TelemetryEvent)
            .where(TelemetryEvent.vehicle_id == "HEMM-01")
            .order_by(TelemetryEvent.id.asc())
        ).all()
        assert len(all_events) == 2
        evt1, evt2 = all_events[0], all_events[1]

        # Event 1 remains unaltered
        assert evt1.speed == 24.5
        assert evt1.risk_level == "LOW"
        assert evt1.recommended_action == "PROCEED"
        assert evt1.data_mode == "SIMULATION"

        # Event 2 has distinct new values
        assert evt2.speed == 16.0
        assert evt2.risk_level == "HIGH"
        assert evt2.recommended_action == "HOLD"
        assert evt2.data_mode == "PHYSICAL_TESTBED"
    print("  -> PASSED: Event 1 (speed=24.5, risk=LOW) and Event 2 (speed=16.0, risk=HIGH) both exist intact.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 6. Latest event is selected using: timestamp DESC, id DESC
    # ------------------------------------------------------------------
    print("\n[Criterion 6/12] Testing latest telemetry deterministic ordering (timestamp DESC, id DESC)...")
    latest_res = client.get("/api/telemetry/HEMM-01")
    assert latest_res.status_code == 200
    latest_data = latest_res.json()
    assert latest_data["speed"] == 16.0
    assert latest_data["risk_level"] == "HIGH"
    assert latest_data["recommended_action"] == "HOLD"
    assert latest_data["object_distance"] == 25.0
    print("  -> PASSED: Latest telemetry returned newest event (t2=10:00:05Z, risk=HIGH).")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 7. History endpoint returns persisted events newest first
    # ------------------------------------------------------------------
    print("\n[Criterion 7/12] Testing GET /api/telemetry/HEMM-01/history (newest first)...")
    hist_res = client.get("/api/telemetry/HEMM-01/history?limit=10")
    assert hist_res.status_code == 200
    history = hist_res.json()
    assert len(history) == 2, f"Expected 2 historical records, got {len(history)}"
    # First item in history must be the newest event (t2)
    assert history[0]["timestamp"] == "2026-09-11T10:00:05Z"
    assert history[0]["risk_level"] == "HIGH"
    # Second item must be the earlier event (t1)
    assert history[1]["timestamp"] == "2026-09-11T10:00:00Z"
    assert history[1]["risk_level"] == "LOW"
    print(f"  -> PASSED: History returned {len(history)} events ordered newest first.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 8. POST with HEMM-999 returns HTTP 404
    # ------------------------------------------------------------------
    print("\n[Criterion 8/12] Testing POST /api/telemetry with unknown vehicle HEMM-999...")
    invalid_veh_payload = dict(payload_t1)
    invalid_veh_payload["vehicle_id"] = "HEMM-999"
    res_unknown_post = client.post("/api/telemetry", json=invalid_veh_payload)
    assert res_unknown_post.status_code == 404, f"Expected 404, got {res_unknown_post.status_code}"
    detail = res_unknown_post.json().get("detail", "")
    assert "not a registered prototype" in detail.lower() or "not found" in detail.lower()
    print(f"  -> PASSED: Ingestion rejected unknown vehicle with 404 Not Found ('{detail}').")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 9. GET with HEMM-999 returns HTTP 404
    # ------------------------------------------------------------------
    print("\n[Criterion 9/12] Testing GET /api/telemetry/HEMM-999...")
    res_unknown_get = client.get("/api/telemetry/HEMM-999")
    assert res_unknown_get.status_code == 404
    print("  -> PASSED: GET for unregistered vehicle returned 404 Not Found.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 10. Invalid payload returns HTTP 422
    # ------------------------------------------------------------------
    print("\n[Criterion 10/12] Testing POST /api/telemetry with malformed schema (422 expected)...")
    malformed_payload = {
        "vehicle_id": "HEMM-01",
        "speed": "NOT_A_FLOAT",
        "risk_level": "INVALID_RISK_ENUM",
        # missing mandatory position, sensor_health, etc.
    }
    res_422 = client.post("/api/telemetry", json=malformed_payload)
    assert res_422.status_code == 422
    errors = res_422.json().get("detail", [])
    assert len(errors) > 0
    print(f"  -> PASSED: Pydantic validation rejected malformed payload with 422 ({len(errors)} field errors).")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 11. Database failure never produces HTTP 201
    # ------------------------------------------------------------------
    print("\n[Criterion 11/12] Testing database failure handling (never produces 201)...")
    # Simulate database failure during transaction commit
    with patch("app.database.repositories.TelemetryRepository.append", side_effect=Exception("Simulated DB connection timeout")):
        res_fail = client.post("/api/telemetry", json=payload_t1)
        assert res_fail.status_code != 201, "CRITICAL ERROR: Database failure returned HTTP 201!"
        assert res_fail.status_code == 503, f"Expected 503 Service Unavailable, got {res_fail.status_code}"
        assert "database persistence unavailable" in res_fail.json().get("detail", "").lower()
    print("  -> PASSED: Database failure returned HTTP 503 Service Unavailable (never false 201).")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 12. data_mode and source_metadata survive persistence and retrieval unchanged
    # ------------------------------------------------------------------
    print("\n[Criterion 12/12] Testing data provenance preservation...")
    payload_provenance = {
        "vehicle_id": "HEMM-02",
        "vehicle_type": "100T DUMPER (LEAD)",
        "timestamp": "2026-09-11T10:15:00Z",
        "position": {
            "latitude": 18.6800,
            "longitude": 81.2550,
            "altitude": 630.0,
        },
        "heading": 95.0,
        "speed": 12.0,
        "visibility_condition": "POOR",
        "object_detected": False,
        "object_type": None,
        "object_distance": None,
        "relative_speed": None,
        "ttc": None,
        "risk_score": 0.05,
        "risk_level": "LOW",
        "recommended_action": "PROCEED",
        "sensor_health": {
            "radar": "HEALTHY",
            "thermal": "HEALTHY",
            "gnss": "HEALTHY",
            "imu": "HEALTHY",
        },
        "network_status": "ONLINE",
        "data_mode": "LIVE",
        "source_metadata": "HEMM EDGE NODE • LIVE",
    }
    res_prov = client.post("/api/telemetry", json=payload_provenance)
    assert res_prov.status_code == 201

    get_prov = client.get("/api/telemetry/HEMM-02")
    assert get_prov.status_code == 200
    prov_data = get_prov.json()
    assert prov_data["data_mode"] == "LIVE"
    assert prov_data["source_metadata"] == "HEMM EDGE NODE • LIVE"
    print(f"  -> PASSED: Provenance fields preserved exactly: data_mode='{prov_data['data_mode']}', source_metadata='{prov_data['source_metadata']}'.")
    passed_criteria += 1

    print("\n======================================================================")
    print(f"CP6 PERSISTENCE VERIFICATION: {passed_criteria}/12 CRITERIA PASSED SUCCESSFULLY!")
    print("======================================================================")


if __name__ == "__main__":
    try:
        run_cp6_tests()
    except AssertionError as err:
        print(f"\n❌ CP6 TEST ASSERTION FAILED: {err}", file=sys.stderr)
        sys.exit(1)
    except Exception as exc:
        print(f"\n❌ UNEXPECTED ERROR: {exc}", file=sys.stderr)
        sys.exit(1)

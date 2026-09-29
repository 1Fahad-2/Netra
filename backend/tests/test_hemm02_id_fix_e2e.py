"""
NETRA — Feature 11 bug-fix verification (HEMM-HEMM-02 -> HEMM-02)

Drives the REAL pipeline end-to-end through the HTTP API (isolated SQLite
DB, same pattern as test_cp8_e2e.py) and asserts the exact scenario from
the bug report:

    POST /api/telemetry (HEMM-01, HEMM-02)
    GET  /api/esp/HEMM-01/safety-state

Only checks the vehicle_id fix + the requested full sequence. Does not
touch v2v_engine, blind_curve_state_service, or the OLED priority logic.
"""

import os
import sys
import tempfile
from datetime import datetime, timezone

_temp_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_temp_dir, "test_hemm_fix.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient
from sqlalchemy import event

from app.database.connection import engine, Base, SessionLocal
from app.database.repositories import VehicleRepository
from app.main import app
from app.services.blind_curve_state_service import (
    BC01_START_DIST_M,
    BC01_END_DIST_M,
    BC02_APPROACH_DIST_M,
    BC02_END_DIST_M,
)


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


Base.metadata.create_all(bind=engine)
with SessionLocal() as db:
    VehicleRepository.seed_prototypes(db)

client = TestClient(app)

PASS, FAIL = "PASS", "FAIL"
_results = []


def check(name: str, condition: bool, info=""):
    _results.append(bool(condition))
    print(f"[{PASS if condition else FAIL}] {name}" + (f" — {info}" if info else ""))


def _telemetry(vehicle_id: str, route_distance: float, extra=None):
    base = {
        "vehicle_id": vehicle_id,
        "vehicle_type": "100T DUMPER",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "position": {"latitude": 18.7, "longitude": 81.2, "altitude": 600.0},
        "heading": 90.0,
        "speed": 20.0,
        "gps_accuracy": 2.0,
        "sensor_status": "HEALTHY",
        "visibility_condition": "NORMAL",
        "object_detected": False,
        "object_type": None,
        "object_distance": None,
        "relative_speed": None,
        "ttc": None,
        "risk_score": None,
        "risk_level": None,
        "recommended_action": None,
        "risk_reason": None,
        "sensor_health": {
            "radar": "HEALTHY", "thermal": "HEALTHY",
            "gnss": "HEALTHY", "imu": "HEALTHY",
        },
        "network_status": "ONLINE",
        "data_mode": "SIMULATION",
        "source_metadata": "SIMULATION",
        "route_distance": route_distance,
        "section_id": "SEC-01",
        "data_source": "SIMULATED",
    }
    if extra:
        base.update(extra)
    return base


def post(vehicle_id, route_distance):
    r = client.post("/api/telemetry", json=_telemetry(vehicle_id, route_distance))
    assert r.status_code in (200, 201), r.text
    return r.json()


def esp_state(vehicle_id):
    r = client.get(f"/api/esp/{vehicle_id}/safety-state")
    assert r.status_code == 200, r.text
    return r.json()


def run():
    bc1_mid = (BC01_START_DIST_M + BC01_END_DIST_M) / 2
    bc2_mid = (BC02_APPROACH_DIST_M + BC02_END_DIST_M) / 2

    # keep HEMM-02 far away initially so it never creates a conflict
    post("HEMM-02", route_distance=1800.0)

    # 1. HEMM-01 far from BC1 -> SAFE
    post("HEMM-01", route_distance=0.0)
    s = esp_state("HEMM-01")
    check("1. Far from BC1 -> SAFE", s["upcoming_hazard"]["status"] == "SAFE", s["upcoming_hazard"])

    # 2. HEMM-01 approaches BC1 -> UPCOMING BLIND CURVE 1
    post("HEMM-01", route_distance=BC01_START_DIST_M - 60)
    s = esp_state("HEMM-01")
    check("2. Approach BC1 -> UPCOMING BLIND CURVE 1", s["upcoming_hazard"]["status"] == "UPCOMING" and s["upcoming_hazard"]["section_id"] == "BLIND_CURVE_01", s["upcoming_hazard"])

    # 3. HEMM-01 enters BC1 -> BLIND CURVE 1 ACTIVE
    post("HEMM-01", route_distance=bc1_mid)
    s = esp_state("HEMM-01")
    check("3. Inside BC1 -> BLIND CURVE 1 ACTIVE", s["upcoming_hazard"]["status"] == "ACTIVE" and s["upcoming_hazard"]["section_id"] == "BLIND_CURVE_01", s["upcoming_hazard"])

    # 4. HEMM-02 approaches HEMM-01 (gap < 20m) -> UPCOMING VEHICLE, correct id
    post("HEMM-02", route_distance=bc1_mid - 16.66)
    post("HEMM-01", route_distance=bc1_mid)  # refresh HEMM-01 so its V2V picks up HEMM-02's new position
    s = esp_state("HEMM-01")
    check("4. Vehicle approach -> UPCOMING VEHICLE", s["approaching_vehicle"]["detected"] is True, s["approaching_vehicle"])
    check(
        "4b. vehicle_alert.vehicle_id == 'HEMM-02' (THE FIX)",
        s["approaching_vehicle"]["detected"] is True and s["approaching_vehicle"]["object_type"] == "HEMM-02",
        s.get("approaching_vehicle"),
    )
    check(
        "4c. HEMM-01 field itself unaffected",
        s["vehicle_id"] == "HEMM-01",
        s["vehicle_id"],
    )

    # 5. HEMM-02 passes (gap widens) -> vehicle alert clears
    post("HEMM-02", route_distance=200.0)
    post("HEMM-01", route_distance=bc1_mid)  # refresh HEMM-01 timestamp, same position
    s = esp_state("HEMM-01")
    check("5. Vehicle passes -> alert clears", s["approaching_vehicle"]["detected"] is False, s["approaching_vehicle"])

    # 6. HEMM-01 leaves BC1 -> SAFE
    post("HEMM-01", route_distance=BC01_END_DIST_M + 80)
    s = esp_state("HEMM-01")
    check("6. Leaves BC1 -> SAFE", s["upcoming_hazard"]["status"] == "SAFE", s["upcoming_hazard"])

    # 7. HEMM-01 approaches BC2 -> UPCOMING BLIND CURVE 2
    post("HEMM-01", route_distance=BC02_APPROACH_DIST_M - 60)
    s = esp_state("HEMM-01")
    check("7. Approach BC2 -> UPCOMING BLIND CURVE 2", s["upcoming_hazard"]["status"] == "UPCOMING" and s["upcoming_hazard"]["section_id"] == "BLIND_CURVE_02", s["upcoming_hazard"])

    # 8. HEMM-01 enters BC2 -> BLIND CURVE 2 ACTIVE, no HEMM-02 alert
    post("HEMM-01", route_distance=bc2_mid)
    s = esp_state("HEMM-01")
    check("8. Inside BC2 -> BLIND CURVE 2 ACTIVE", s["upcoming_hazard"]["status"] == "ACTIVE" and s["upcoming_hazard"]["section_id"] == "BLIND_CURVE_02", s["upcoming_hazard"])
    check("8b. No fabricated HEMM-02 alert on BC2", s["approaching_vehicle"]["detected"] is False, s["approaching_vehicle"])


if __name__ == "__main__":
    run()
    total, passed = len(_results), sum(_results)
    print(f"\n{passed}/{total} checks passed")
    sys.exit(0 if passed == total else 1)

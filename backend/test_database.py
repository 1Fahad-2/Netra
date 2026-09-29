"""
MachineMind — Database Foundation Test Suite (Checkpoint 5)
Verifies all 15 required database criteria:
1. Database connection works.
2. Migration runs successfully.
3. vehicles table exists.
4. Exactly two prototype vehicles exist.
5. HEMM-01 exists.
6. HEMM-02 exists.
7. No third vehicle exists.
8. telemetry_events accepts a valid telemetry record.
9. Multiple telemetry events for the same vehicle are preserved.
10. Historical telemetry is NOT overwritten (append-only ledger).
11. alerts can be persisted.
12. sensor_health can be persisted.
13. system_events can be persisted.
14. Foreign-key relationships work.
15. Invalid/unregistered vehicle references are rejected appropriately.
"""

import os
import sys
import tempfile
from datetime import datetime, timezone, timedelta
from sqlalchemy import create_engine, inspect, text, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from alembic.config import Config
from alembic import command

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import Base
from app.database.models import (
    Vehicle,
    TelemetryEvent,
    Alert,
    SensorHealth,
    SystemEvent,
    utc_now,
)
from app.database.repositories import (
    VehicleRepository,
    TelemetryRepository,
    AlertRepository,
    SensorHealthRepository,
    SystemEventRepository,
)


def run_tests():
    """Run all 15 database verification checks sequentially."""
    print("======================================================================")
    print("MACHINEMIND CHECKPOINT 5: DATABASE FOUNDATION TEST SUITE")
    print("======================================================================")

    # Use an isolated SQLite file for deterministic, clean testing without touching user data
    temp_dir = tempfile.mkdtemp()
    test_db_path = os.path.join(temp_dir, "test_machinemind.db")
    test_db_url = f"sqlite:///{test_db_path}"
    print(f"Isolated Test Database: {test_db_url}")

    # Create engine with foreign keys strictly enabled
    engine = create_engine(test_db_url, echo=False)

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    passed_tests = 0

    # ------------------------------------------------------------------
    # 1. Database connection works
    # ------------------------------------------------------------------
    print("\n[Test 1/15] Verifying database connection...")
    with engine.connect() as conn:
        res = conn.execute(text("SELECT 1")).scalar()
        assert res == 1, "Database connection failed"
    print("  -> PASSED: Database engine connected and executed SELECT 1 successfully.")
    passed_tests += 1

    # ------------------------------------------------------------------
    # 2. Migration runs successfully
    # ------------------------------------------------------------------
    print("\n[Test 2/15] Verifying Alembic migration execution...")
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    alembic_cfg = Config(os.path.join(backend_dir, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(backend_dir, "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", test_db_url)

    # Run upgrade to head
    command.upgrade(alembic_cfg, "head")
    print("  -> PASSED: Alembic migration (0001_initial_schema) applied successfully.")
    passed_tests += 1

    # ------------------------------------------------------------------
    # 3. vehicles table exists
    # ------------------------------------------------------------------
    print("\n[Test 3/15] Verifying 'vehicles' and related tables exist...")
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "vehicles" in tables, "vehicles table missing"
    assert "telemetry_events" in tables, "telemetry_events table missing"
    assert "alerts" in tables, "alerts table missing"
    assert "sensor_health" in tables, "sensor_health table missing"
    assert "system_events" in tables, "system_events table missing"
    print(f"  -> PASSED: Required tables verified present: {tables}")
    passed_tests += 1

    # Open session for repository and schema checks
    with TestSession() as db:
        # ------------------------------------------------------------------
        # 4. Exactly two prototype vehicles exist
        # ------------------------------------------------------------------
        print("\n[Test 4/15] Verifying exactly two prototype vehicles exist...")
        vehicles = VehicleRepository.get_all(db)
        assert len(vehicles) == 2, f"Expected exactly 2 vehicles, found {len(vehicles)}"
        print(f"  -> PASSED: Fleet count is exactly {len(vehicles)}.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 5. HEMM-01 exists
        # ------------------------------------------------------------------
        print("\n[Test 5/15] Verifying HEMM-01 exists with correct attributes...")
        v1 = VehicleRepository.get_by_id(db, "HEMM-01")
        assert v1 is not None, "HEMM-01 is missing"
        assert v1.vehicle_id == "HEMM-01"
        assert "100T DUMPER" in v1.vehicle_type
        assert v1.status == "ACTIVE"
        assert v1.data_provenance == "SIMULATED"
        print(f"  -> PASSED: HEMM-01 verified: {v1.vehicle_type}, status={v1.status}")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 6. HEMM-02 exists
        # ------------------------------------------------------------------
        print("\n[Test 6/15] Verifying HEMM-02 exists with correct attributes...")
        v2 = VehicleRepository.get_by_id(db, "HEMM-02")
        assert v2 is not None, "HEMM-02 is missing"
        assert v2.vehicle_id == "HEMM-02"
        assert "100T DUMPER" in v2.vehicle_type
        assert v2.status == "ACTIVE"
        assert v2.data_provenance == "SIMULATED"
        print(f"  -> PASSED: HEMM-02 verified: {v2.vehicle_type}, status={v2.status}")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 7. No third vehicle exists
        # ------------------------------------------------------------------
        print("\n[Test 7/15] Verifying no third vehicle exists (zero fleet inflation)...")
        all_ids = {v.vehicle_id for v in vehicles}
        assert all_ids == {"HEMM-01", "HEMM-02"}, f"Unexpected fleet members: {all_ids}"
        assert VehicleRepository.get_by_id(db, "HEMM-03") is None
        print(f"  -> PASSED: Vehicle IDs are strictly {all_ids}. No unauthorized vehicles exist.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 8. telemetry_events accepts a valid telemetry record
        # ------------------------------------------------------------------
        print("\n[Test 8/15] Verifying telemetry_events accepts valid telemetry record...")
        t1_time = datetime(2026, 9, 11, 10, 0, 0, tzinfo=timezone.utc)
        record1 = TelemetryEvent(
            vehicle_id="HEMM-01",
            timestamp=t1_time,
            latitude=18.6750,
            longitude=81.2500,
            altitude=620.5,
            heading=45.0,
            speed=22.4,
            visibility_condition="NORMAL",
            object_detected=True,
            object_type="HEMM-02",
            object_distance=48.0,
            relative_speed=-4.2,
            ttc=11.4,
            risk_score=0.35,
            risk_level="MEDIUM",
            recommended_action="REDUCE SPEED",
            sensor_radar="HEALTHY",
            sensor_thermal="HEALTHY",
            sensor_gnss="HEALTHY",
            sensor_imu="HEALTHY",
            network_status="ONLINE",
            data_mode="SIMULATION",
            source_metadata="CP5 Testbed Verification Run",
        )
        saved_record1 = TelemetryRepository.append(db, record1)
        assert saved_record1.id is not None
        assert saved_record1.vehicle_id == "HEMM-01"
        assert saved_record1.speed == 22.4
        print(f"  -> PASSED: Telemetry record persisted with ID={saved_record1.id}.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 9. Multiple telemetry events for the same vehicle are preserved
        # ------------------------------------------------------------------
        print("\n[Test 9/15] Verifying multiple telemetry events for HEMM-01 are preserved...")
        t2_time = datetime(2026, 9, 11, 10, 0, 2, tzinfo=timezone.utc)
        record2 = TelemetryEvent(
            vehicle_id="HEMM-01",
            timestamp=t2_time,
            latitude=18.6755,
            longitude=81.2505,
            altitude=621.0,
            heading=47.0,
            speed=18.0,
            visibility_condition="NORMAL",
            object_detected=True,
            object_type="HEMM-02",
            object_distance=32.0,
            relative_speed=-3.8,
            ttc=8.4,
            risk_score=0.72,
            risk_level="HIGH",
            recommended_action="HOLD",
            sensor_radar="HEALTHY",
            sensor_thermal="HEALTHY",
            sensor_gnss="HEALTHY",
            sensor_imu="HEALTHY",
            network_status="ONLINE",
            data_mode="SIMULATION",
            source_metadata="CP5 Testbed Verification Run - High Risk",
        )
        saved_record2 = TelemetryRepository.append(db, record2)
        total_records = TelemetryRepository.count(db, "HEMM-01")
        assert total_records == 2, f"Expected 2 telemetry records, found {total_records}"
        print(f"  -> PASSED: Total telemetry events for HEMM-01 is now {total_records}.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 10. Historical telemetry is NOT overwritten (Append-only)
        # ------------------------------------------------------------------
        print("\n[Test 10/15] Verifying historical telemetry is NOT overwritten (Append-only)...")
        history = TelemetryRepository.get_history(db, "HEMM-01", limit=10)
        assert len(history) == 2, f"Expected 2 historical records, found {len(history)}"

        # history is newest first
        latest_event = history[0]
        older_event = history[1]

        assert latest_event.id == saved_record2.id
        latest_ts = latest_event.timestamp if latest_event.timestamp.tzinfo else latest_event.timestamp.replace(tzinfo=timezone.utc)
        older_ts = older_event.timestamp if older_event.timestamp.tzinfo else older_event.timestamp.replace(tzinfo=timezone.utc)
        assert latest_ts == t2_time
        assert latest_event.risk_level == "HIGH"
        assert latest_event.speed == 18.0

        assert older_event.id == saved_record1.id
        assert older_ts == t1_time
        assert older_event.risk_level == "MEDIUM"
        assert older_event.speed == 22.4

        print("  -> PASSED: Historical record 1 (t1=10:00:00, speed=22.4, risk=MEDIUM) remains intact.")
        print("  -> PASSED: Historical record 2 (t2=10:00:02, speed=18.0, risk=HIGH) correctly appended.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 11. alerts can be persisted
        # ------------------------------------------------------------------
        print("\n[Test 11/15] Verifying alerts can be persisted...")
        alert = Alert(
            id="ALT-CP5TEST01",
            vehicle_id="HEMM-01",
            severity="CRITICAL",
            title="CRITICAL COLLISION PROXIMITY HAZARD",
            reason="Closing headway to lead vehicle (32m, TTC 8.4s). Action: HOLD.",
            timestamp=t2_time,
            relative_time="JUST NOW",
            latitude=18.6755,
            longitude=81.2505,
            status="ACTIVE",
        )
        saved_alert = AlertRepository.create(db, alert)
        assert saved_alert.id == "ALT-CP5TEST01"
        active_alerts = AlertRepository.get_active(db)
        assert any(a.id == "ALT-CP5TEST01" for a in active_alerts)
        print(f"  -> PASSED: Alert '{saved_alert.id}' persisted and retrieved successfully.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 12. sensor_health can be persisted
        # ------------------------------------------------------------------
        print("\n[Test 12/15] Verifying sensor_health can be persisted...")
        sensor_rec = SensorHealth(
            vehicle_id="HEMM-01",
            timestamp=t2_time,
            radar="HEALTHY",
            thermal="HEALTHY",
            gnss="HEALTHY",
            imu="HEALTHY",
        )
        saved_sensor = SensorHealthRepository.create(db, sensor_rec)
        assert saved_sensor.id is not None
        latest_sensor = SensorHealthRepository.get_latest_for_vehicle(db, "HEMM-01")
        assert latest_sensor is not None
        assert latest_sensor.radar == "HEALTHY"
        print(f"  -> PASSED: Sensor health record persisted for HEMM-01 (ID={saved_sensor.id}).")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 13. system_events can be persisted
        # ------------------------------------------------------------------
        print("\n[Test 13/15] Verifying system_events can be persisted...")
        sys_event = SystemEvent(
            vehicle_id="HEMM-01",
            event_type="NETWORK_OFFLINE",
            message="Edge node buffer activated during mine bench dead-zone",
            timestamp=t2_time,
            event_metadata={"buffer_size": 12, "rssi_dbm": -98},
        )
        saved_event = SystemEventRepository.create(db, sys_event)
        assert saved_event.id is not None
        recent_events = SystemEventRepository.get_recent(db)
        assert any(e.id == saved_event.id for e in recent_events)
        print(f"  -> PASSED: System event '{saved_event.event_type}' persisted with metadata.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 14. Foreign-key relationships work
        # ------------------------------------------------------------------
        print("\n[Test 14/15] Verifying foreign-key relationships on Vehicle model...")
        v1_reloaded = VehicleRepository.get_by_id(db, "HEMM-01")
        assert len(v1_reloaded.telemetry_events) >= 2, "Relationship to telemetry_events failed"
        assert len(v1_reloaded.alerts) >= 1, "Relationship to alerts failed"
        assert len(v1_reloaded.sensor_health_records) >= 1, "Relationship to sensor_health failed"
        assert len(v1_reloaded.system_events) >= 1, "Relationship to system_events failed"
        print("  -> PASSED: Vehicle entity successfully loaded all child relationships.")
        passed_tests += 1

        # ------------------------------------------------------------------
        # 15. Invalid/unregistered vehicle references are rejected appropriately
        # ------------------------------------------------------------------
        print("\n[Test 15/15] Verifying invalid vehicle references are rejected by Foreign Key...")
        invalid_record = TelemetryEvent(
            vehicle_id="HEMM-999-UNREGISTERED",
            timestamp=utc_now(),
            latitude=18.0,
            longitude=81.0,
            heading=0.0,
            speed=0.0,
            visibility_condition="NORMAL",
            risk_level="LOW",
            recommended_action="PROCEED",
            sensor_radar="HEALTHY",
            sensor_thermal="HEALTHY",
            sensor_gnss="HEALTHY",
            sensor_imu="HEALTHY",
            network_status="ONLINE",
            data_mode="SIMULATION",
            source_metadata="Should fail FK check",
        )
        try:
            db.add(invalid_record)
            db.commit()
            raise AssertionError("Foreign key violation was NOT raised for unregistered vehicle!")
        except IntegrityError:
            db.rollback()
            print("  -> PASSED: IntegrityError correctly raised for unregistered vehicle 'HEMM-999-UNREGISTERED'.")
            passed_tests += 1

    print("\n======================================================================")
    print(f"DATABASE VERIFICATION COMPLETE: {passed_tests}/15 TESTS PASSED SUCCESSFULLY!")
    print("======================================================================")


if __name__ == "__main__":
    run_tests()

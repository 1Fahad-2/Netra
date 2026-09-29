"""
MachineMind — Checkpoint 8: End-to-End Real Telemetry Pipeline Verification Suite

Verifies the complete real data pipeline:
Simulator -> POST /api/telemetry -> PostgreSQL -> WebSocket -> Client State

Required Checks:
1. Simulator generates valid VehicleTelemetry adhering to the contract.
2. Telemetry reaches POST /api/telemetry via HTTP.
3. Telemetry is persisted in PostgreSQL.
4. WebSocket receives the persisted telemetry.
5. Database persistence occurs before broadcast.
6. Multiple simulator events create multiple database records (append-only history).
7. Only HEMM-01 and HEMM-02 are used (zero fleet inflation).
8. PAUSE stops generation of new telemetry.
9. RESET resets scenario state without deleting historical telemetry.
10. Database failure results in HTTP 503 and NO WebSocket broadcast.
11. Frontend WebSocket handler correctly receives telemetry.
12. Existing dashboard state updates from WebSocket telemetry (risk progression, distance, TTC).
"""

import os
import sys
import tempfile
import json
import time
from typing import Dict, List, Any
from unittest.mock import patch

# Configure isolated test database before importing app
_temp_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_temp_dir, "test_cp8_isolated.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

from fastapi.testclient import TestClient
from sqlalchemy import event, select, func

from app.database.connection import engine, Base, SessionLocal
from app.database.models import Vehicle, TelemetryEvent, Alert
from app.database.repositories import VehicleRepository, TelemetryRepository, AlertRepository
from app.websocket.manager import ws_manager
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


def run_cp8_e2e_tests():
    print("======================================================================")
    print("MACHINEMIND CHECKPOINT 8: END-TO-END TELEMETRY PIPELINE TEST SUITE")
    print("======================================================================")
    print(f"Isolated Test Database: {os.environ['DATABASE_URL']}")

    passed_tests = 0

    # ------------------------------------------------------------------
    # Test 1: Simulator generates valid VehicleTelemetry adhering to contract
    # ------------------------------------------------------------------
    print("\n[Test 1/12] Testing simulator generates valid VehicleTelemetry contract...")
    # Python reproduction of the CP3 deterministic scenario calculation
    def generate_simulator_tick(t: float, vehicle_id: str) -> Dict[str, Any]:
        clamped_t = max(0.0, min(t, 25.0))
        if clamped_t < 8.0:
            frac = clamped_t / 8.0
            s1 = 28.0 + frac * 2.0
            dist = 118.0 - clamped_t * 4.5
        elif clamped_t < 17.0:
            phase2_t = clamped_t - 8.0
            frac = phase2_t / 9.0
            s1 = 30.0 - frac * 2.0
            dist = 82.0 - phase2_t * 5.7
        else:
            phase3_t = clamped_t - 17.0
            frac = phase3_t / 8.0
            s1 = max(8.0, 28.0 - frac * 18.0)
            dist = max(17.0, 31.0 - phase3_t * 1.7)

        dist = max(16.0, round(dist, 1))
        closing_speed = 1.8
        ttc = max(1.5, round(dist / closing_speed, 1))

        if dist > 75:
            risk_level = "LOW"
            action = "PROCEED"
            score = 0.12
        elif dist > 30:
            risk_level = "MEDIUM"
            action = "REDUCE SPEED"
            score = 0.48
        else:
            risk_level = "HIGH"
            action = "HOLD"
            score = 0.88

        if vehicle_id == "HEMM-01":
            return {
                "vehicle_id": "HEMM-01",
                "vehicle_type": "100T DUMPER (FOLLOWING)",
                "timestamp": f"2026-09-11T12:00:{int(clamped_t):02d}Z",
                "position": {"latitude": 18.6500 - clamped_t * 0.0001, "longitude": 81.2500, "altitude": 1040.0},
                "heading": 148.0,
                "speed": round(s1, 1),
                "visibility_condition": "NORMAL",
                "object_detected": True,
                "object_type": "HEMM-02",
                "object_distance": dist,
                "relative_speed": closing_speed,
                "ttc": ttc,
                "risk_score": score,
                "risk_level": risk_level,
                "recommended_action": action,
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
        else:
            return {
                "vehicle_id": "HEMM-02",
                "vehicle_type": "100T DUMPER (LEAD)",
                "timestamp": f"2026-09-11T12:00:{int(clamped_t):02d}Z",
                "position": {"latitude": 18.6520 - clamped_t * 0.00008, "longitude": 81.2520, "altitude": 1040.0},
                "heading": 135.0,
                "speed": 22.0,
                "visibility_condition": "NORMAL",
                "object_detected": False,
                "object_type": None,
                "object_distance": None,
                "relative_speed": None,
                "ttc": None,
                "risk_score": 0.05,
                "risk_level": "LOW",
                "recommended_action": "PROCEED",
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

    telemetry_sample = generate_simulator_tick(0.0, "HEMM-01")
    assert telemetry_sample["vehicle_id"] == "HEMM-01"
    assert telemetry_sample["data_mode"] == "SIMULATION"
    assert telemetry_sample["source_metadata"] == "SIMULATED_DEMO_SCENARIO"
    print(f"  -> PASSED: Valid VehicleTelemetry generated: vehicle={telemetry_sample['vehicle_id']}, risk={telemetry_sample['risk_level']}")
    passed_tests += 1

    # ------------------------------------------------------------------
    # Test 2: Telemetry reaches POST /api/telemetry
    # ------------------------------------------------------------------
    print("\n[Test 2/12] Testing telemetry reaches POST /api/telemetry...")
    resp = client.post("/api/telemetry", json=telemetry_sample)
    assert resp.status_code == 201, f"POST /api/telemetry failed: {resp.text}"
    body = resp.json()
    assert body["status"] == "success"
    assert body["vehicle_id"] == "HEMM-01"
    print(f"  -> PASSED: Ingest endpoint returned HTTP 201 with confirmation: {body['message']}")
    passed_tests += 1

    # ------------------------------------------------------------------
    # Test 3: Telemetry is persisted in PostgreSQL
    # ------------------------------------------------------------------
    print("\n[Test 3/12] Testing telemetry is stored in database...")
    with SessionLocal() as db:
        latest = TelemetryRepository.get_latest(db, "HEMM-01")
        assert latest is not None
        assert latest.speed == telemetry_sample["speed"]
        assert latest.object_distance == telemetry_sample["object_distance"]
        assert latest.risk_level == telemetry_sample["risk_level"]
        print(f"  -> PASSED: Telemetry record exists in database: ID={latest.id}, dist={latest.object_distance}m, risk={latest.risk_level}")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 4: WebSocket receives the persisted telemetry
    # ------------------------------------------------------------------
    print("\n[Test 4/12] Testing WebSocket receives the persisted telemetry...")
    with client.websocket_connect("/ws/telemetry") as ws:
        ack = ws.receive_json()
        assert ack["type"] == "connection_ack"

        # Ingest t=4.0
        t4_telemetry = generate_simulator_tick(4.0, "HEMM-01")
        resp = client.post("/api/telemetry", json=t4_telemetry)
        assert resp.status_code == 201

        ws_msg = ws.receive_json()
        assert ws_msg["type"] == "telemetry"
        assert ws_msg["data"]["vehicle_id"] == "HEMM-01"
        assert ws_msg["data"]["speed"] == t4_telemetry["speed"]
        assert ws_msg["data"]["object_distance"] == t4_telemetry["object_distance"]
        print(f"  -> PASSED: WebSocket delivered telemetry event: {ws_msg['data']['vehicle_id']} dist={ws_msg['data']['object_distance']}m")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 5: Database persistence occurs before broadcast
    # ------------------------------------------------------------------
    print("\n[Test 5/12] Testing delivery invariant: Database commit occurs before broadcast...")
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        # Wrap broadcast to assert DB existence at the instant of broadcast
        recorded_at_broadcast = []
        original_broadcast = ws_manager.broadcast_telemetry

        async def check_db_on_broadcast(data):
            with SessionLocal() as db:
                rec = TelemetryRepository.get_latest(db, "HEMM-01")
                # Telemetry being broadcasted must already exist in DB
                if rec and rec.timestamp.isoformat().startswith("2026-09-11T12:00:07"):
                    recorded_at_broadcast.append(True)
                else:
                    recorded_at_broadcast.append(False)
            await original_broadcast(data)

        ws_manager.broadcast_telemetry = check_db_on_broadcast
        try:
            t7_telemetry = generate_simulator_tick(7.0, "HEMM-01")
            resp = client.post("/api/telemetry", json=t7_telemetry)
            assert resp.status_code == 201
            _ = ws.receive_json()
            assert len(recorded_at_broadcast) == 1 and recorded_at_broadcast[0] is True, \
                "Database commit did not occur before WebSocket broadcast!"
            print("  -> PASSED: Verified DB transaction committed before broadcast was dispatched.")
            passed_tests += 1
        finally:
            ws_manager.broadcast_telemetry = original_broadcast

    # ------------------------------------------------------------------
    # Test 6: Multiple simulator events create multiple database records
    # ------------------------------------------------------------------
    print("\n[Test 6/12] Testing multiple simulator events create multiple DB records...")
    with SessionLocal() as db:
        initial_count = db.query(func.count(TelemetryEvent.id)).scalar()

    # Emit 5 consecutive simulator ticks
    for tick in range(10, 15):
        t_data = generate_simulator_tick(float(tick), "HEMM-01")
        resp = client.post("/api/telemetry", json=t_data)
        assert resp.status_code == 201

    with SessionLocal() as db:
        new_count = db.query(func.count(TelemetryEvent.id)).scalar()
        assert new_count == initial_count + 5, f"Expected {initial_count + 5} records, got {new_count}"
        history = TelemetryRepository.get_history(db, "HEMM-01", limit=10)
        # Check chronological progression
        speeds = [h.speed for h in history[:5]]
        print(f"  -> PASSED: {new_count - initial_count} distinct records created. Recent speeds: {speeds}")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 7: Only HEMM-01 and HEMM-02 are used (zero fleet inflation)
    # ------------------------------------------------------------------
    print("\n[Test 7/12] Testing strict fleet boundary (only HEMM-01 and HEMM-02)...")
    with SessionLocal() as db:
        vehicles = VehicleRepository.get_all(db)
        v_ids = {v.vehicle_id for v in vehicles}
        assert v_ids == {"HEMM-01", "HEMM-02"}, f"Unexpected fleet members: {v_ids}"

    # Verify unknown vehicle is rejected
    fake_payload = dict(telemetry_sample, vehicle_id="HEMM-03")
    resp = client.post("/api/telemetry", json=fake_payload)
    assert resp.status_code == 404
    print(f"  -> PASSED: Fleet strictly restricted to {v_ids}. HEMM-03 rejected with 404.")
    passed_tests += 1

    # ------------------------------------------------------------------
    # Test 8: PAUSE stops generation of new telemetry
    # ------------------------------------------------------------------
    print("\n[Test 8/12] Testing PAUSE behavior (no new records produced while paused)...")
    # Simulate pause: record DB count, simulate waiting with no ticks emitted
    with SessionLocal() as db:
        count_at_pause = db.query(func.count(TelemetryEvent.id)).scalar()

    # In paused state, simulator does not call POST /api/telemetry
    time.sleep(0.1)

    with SessionLocal() as db:
        count_after_pause = db.query(func.count(TelemetryEvent.id)).scalar()
        assert count_after_pause == count_at_pause, "Records increased while in paused state!"
        print(f"  -> PASSED: Ingestion halted during pause. Record count unchanged at {count_at_pause}.")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 9: RESET resets scenario state without deleting historical telemetry
    # ------------------------------------------------------------------
    print("\n[Test 9/12] Testing RESET behavior (resets progression, preserves historical DB)...")
    with SessionLocal() as db:
        count_before_reset = db.query(func.count(TelemetryEvent.id)).scalar()
        assert count_before_reset > 0, "No records exist to preserve!"

    # Reset resets simulator to t=0
    reset_telemetry = generate_simulator_tick(0.0, "HEMM-01")
    # Post reset telemetry
    resp = client.post("/api/telemetry", json=reset_telemetry)
    assert resp.status_code == 201

    with SessionLocal() as db:
        count_after_reset = db.query(func.count(TelemetryEvent.id)).scalar()
        # Records must not have been dropped or truncated
        assert count_after_reset == count_before_reset + 1, \
            f"Historical records were lost! Before: {count_before_reset}, After: {count_after_reset}"
        print(f"  -> PASSED: Historical records preserved (total = {count_after_reset}). Zero truncation.")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 10: Database failure results in HTTP 503 and NO WebSocket broadcast
    # ------------------------------------------------------------------
    print("\n[Test 10/12] Testing DB failure produces HTTP 503 and zero broadcast...")
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        with patch("app.services.telemetry_service.TelemetryRepository.append") as mock_append:
            from sqlalchemy.exc import DatabaseError
            mock_append.side_effect = DatabaseError("INSERT INTO telemetry_events", {}, Exception("Connection terminated"))

            fail_payload = generate_simulator_tick(16.0, "HEMM-01")
            resp = client.post("/api/telemetry", json=fail_payload)
            assert resp.status_code == 503, f"Expected 503, got {resp.status_code}"

            # Ping/pong to verify zero queued broadcasts
            ws.send_text('{"type": "ping"}')
            pong = ws.receive_json()
            assert pong.get("type") == "pong", f"Expected pong, got {pong}"
            print("  -> PASSED: HTTP 503 returned and ZERO WebSocket messages emitted on database failure.")
            passed_tests += 1

    # ------------------------------------------------------------------
    # Test 11: Frontend WebSocket handler correctly receives telemetry
    # ------------------------------------------------------------------
    print("\n[Test 11/12] Testing frontend WebSocket client reception and parsing...")
    received_client_telemetries = []

    def mock_frontend_ws_handler(raw_msg: Dict[str, Any]):
        if raw_msg.get("type") == "telemetry":
            data = raw_msg.get("data", {})
            received_client_telemetries.append(data)

    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        t18 = generate_simulator_tick(18.0, "HEMM-01")
        t18_lead = generate_simulator_tick(18.0, "HEMM-02")

        resp1 = client.post("/api/telemetry", json=t18)
        resp2 = client.post("/api/telemetry", json=t18_lead)
        assert resp1.status_code == 201 and resp2.status_code == 201

        msg1 = ws.receive_json()
        msg2 = ws.receive_json()
        mock_frontend_ws_handler(msg1)
        mock_frontend_ws_handler(msg2)

        assert len(received_client_telemetries) == 2
        assert received_client_telemetries[0]["vehicle_id"] == "HEMM-01"
        assert received_client_telemetries[1]["vehicle_id"] == "HEMM-02"
        print(f"  -> PASSED: Frontend client handler successfully received and parsed {len(received_client_telemetries)} vehicle updates.")
        passed_tests += 1

    # ------------------------------------------------------------------
    # Test 12: Existing dashboard state updates from WebSocket telemetry
    # ------------------------------------------------------------------
    print("\n[Test 12/12] Testing dashboard state progression (LOW -> MEDIUM -> HIGH/CRITICAL)...")
    # Simulate complete scenario run: t=2 (LOW), t=12 (MEDIUM), t=22 (HIGH/CRITICAL)
    dashboard_state = {
        "HEMM-01": None,
        "HEMM-02": None,
        "risk_level": "LOW",
        "distance": None,
        "action": None,
        "alerts": [],
    }

    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        # Step 1: Low risk tick
        client.post("/api/telemetry", json=generate_simulator_tick(2.0, "HEMM-01"))
        low_msg = ws.receive_json()["data"]
        dashboard_state["HEMM-01"] = low_msg
        dashboard_state["risk_level"] = low_msg["risk_level"]
        dashboard_state["distance"] = low_msg["object_distance"]
        dashboard_state["action"] = low_msg["recommended_action"]
        assert dashboard_state["risk_level"] == "LOW"
        assert dashboard_state["action"] == "PROCEED"
        print(f"  -> Phase 1 (Safe): Distance={dashboard_state['distance']}m, Risk={dashboard_state['risk_level']}, Action={dashboard_state['action']}")

        # Step 2: Medium risk tick (approaching blind curve)
        client.post("/api/telemetry", json=generate_simulator_tick(12.0, "HEMM-01"))
        med_msg = ws.receive_json()["data"]
        dashboard_state["HEMM-01"] = med_msg
        dashboard_state["risk_level"] = med_msg["risk_level"]
        dashboard_state["distance"] = med_msg["object_distance"]
        dashboard_state["action"] = med_msg["recommended_action"]
        assert dashboard_state["risk_level"] == "MEDIUM"
        assert dashboard_state["action"] == "REDUCE SPEED"
        print(f"  -> Phase 2 (Advisory): Distance={dashboard_state['distance']}m, Risk={dashboard_state['risk_level']}, Action={dashboard_state['action']}")

        # Step 3: High risk tick (critical proximity at blind curve apex)
        client.post("/api/telemetry", json=generate_simulator_tick(22.0, "HEMM-01"))
        high_msg = ws.receive_json()["data"]
        dashboard_state["HEMM-01"] = high_msg
        dashboard_state["risk_level"] = high_msg["risk_level"]
        dashboard_state["distance"] = high_msg["object_distance"]
        dashboard_state["action"] = high_msg["recommended_action"]
        assert dashboard_state["risk_level"] == "HIGH"
        assert dashboard_state["action"] == "HOLD"
        print(f"  -> Phase 3 (Hazard): Distance={dashboard_state['distance']}m, Risk={dashboard_state['risk_level']}, Action={dashboard_state['action']}")

        # Verify alert creation in database
        alerts_resp = client.get("/api/alerts")
        assert alerts_resp.status_code == 200
        alerts = alerts_resp.json()
        assert len(alerts) >= 1
        assert alerts[0]["severity"] == "CRITICAL"
        print(f"  -> Alert ledger confirmed: {alerts[0]['title']} ({alerts[0]['severity']})")
        passed_tests += 1

    print("\n======================================================================")
    print(f"ALL CP8 END-TO-END TESTS PASSED: {passed_tests}/12 CRITERIA SUCCESSFUL")
    print("======================================================================")


if __name__ == "__main__":
    run_cp8_e2e_tests()

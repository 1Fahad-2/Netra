"""
MachineMind — Checkpoint 7: WebSocket Live Telemetry Stream Verification Suite

Tests the real-time WebSocket distribution layer and delivery semantics:
1. Client connects successfully to /ws/telemetry.
2. Connection ack message is received on connect.
3. Ping / Pong message exchange works over WebSocket.
4. Active connection count is tracked correctly.
5. Ingesting valid telemetry via POST /api/telemetry persists to database.
6. Ingesting valid telemetry broadcasts {"type": "telemetry", "data": ...} to WebSocket.
7. Broadcasted payload strictly adheres to the VehicleTelemetry contract.
8. Multiple connected clients receive the broadcasted telemetry.
9. Delivery invariant: Database persistence occurs BEFORE WebSocket broadcast.
10. Database failure results in HTTP 503 and causes ZERO WebSocket broadcasts.
11. Rejected vehicle (e.g. HEMM-999) returns HTTP 404 and causes ZERO WebSocket broadcasts.
12. Disconnecting a client properly decrements active connection count.
"""

import os
import sys
import tempfile
import asyncio
from datetime import datetime, timezone
from unittest.mock import patch

# Configure isolated test database before importing app
_temp_dir = tempfile.mkdtemp()
_test_db_path = os.path.join(_temp_dir, "test_cp7_isolated.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_test_db_path}"

from fastapi.testclient import TestClient
from sqlalchemy import event, select, func

from app.database.connection import engine, Base, SessionLocal
from app.database.models import Vehicle, TelemetryEvent
from app.database.repositories import VehicleRepository, TelemetryRepository
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


def run_cp7_tests():
    print("======================================================================")
    print("MACHINEMIND CHECKPOINT 7: WEBSOCKET LIVE TELEMETRY VERIFICATION")
    print("======================================================================")
    print(f"Isolated Test Database: {os.environ['DATABASE_URL']}")

    passed_criteria = 0

    # ------------------------------------------------------------------
    # 1. Connect to /ws/telemetry & receive connection_ack
    # ------------------------------------------------------------------
    print("\n[Criterion 1/12] Testing WebSocket connection and greeting ack...")
    with client.websocket_connect("/ws/telemetry") as ws:
        ack = ws.receive_json()
        assert ack.get("type") == "connection_ack", f"Expected 'connection_ack', got {ack}"
        assert "HEMM-01" in ack.get("vehicle_ids", []), f"Missing HEMM-01 in ack: {ack}"
        assert "HEMM-02" in ack.get("vehicle_ids", []), f"Missing HEMM-02 in ack: {ack}"
        print(f"  -> Connected successfully, received ack: {ack['message']}")
        passed_criteria += 1

    # ------------------------------------------------------------------
    # 2. Ping / Pong message exchange
    # ------------------------------------------------------------------
    print("\n[Criterion 2/12] Testing WebSocket ping/pong keep-alive...")
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()  # discard ack
        ws.send_text('{"type": "ping"}')
        pong = ws.receive_json()
        assert pong.get("type") == "pong", f"Expected 'pong', got {pong}"
        print(f"  -> Ping/Pong exchange succeeded: {pong}")
        passed_criteria += 1

    # ------------------------------------------------------------------
    # 3. Active connection count tracking
    # ------------------------------------------------------------------
    print("\n[Criterion 3/12] Testing active connection count tracking...")
    initial_count = ws_manager.active_connection_count()
    with client.websocket_connect("/ws/telemetry") as ws1:
        _ = ws1.receive_json()
        assert ws_manager.active_connection_count() == initial_count + 1
        with client.websocket_connect("/ws/telemetry") as ws2:
            _ = ws2.receive_json()
            assert ws_manager.active_connection_count() == initial_count + 2
            print(f"  -> Active connections correctly counted: {ws_manager.active_connection_count()}")
    assert ws_manager.active_connection_count() == initial_count
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 4. Clean disconnection handling
    # ------------------------------------------------------------------
    print("\n[Criterion 4/12] Testing clean disconnection cleanup...")
    count_before = ws_manager.active_connection_count()
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()
        assert ws_manager.active_connection_count() == count_before + 1
    # After exiting block, connection is closed
    assert ws_manager.active_connection_count() == count_before
    print(f"  -> Connection cleanly removed on socket close. Active count: {ws_manager.active_connection_count()}")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 5. Telemetry ingestion persists to DB and broadcasts to WebSocket
    # ------------------------------------------------------------------
    print("\n[Criterion 5/12] Testing POST /api/telemetry persists to DB and triggers broadcast...")
    sample_telemetry = {
        "vehicle_id": "HEMM-01",
        "vehicle_type": "100T DUMPER (FOLLOWING)",
        "timestamp": "2026-09-11T12:00:00Z",
        "position": {"latitude": 18.6500, "longitude": 81.2500, "altitude": 1040.0},
        "heading": 145.0,
        "speed": 26.0,
        "visibility_condition": "NORMAL",
        "object_detected": True,
        "object_type": "HEMM-02",
        "object_distance": 68.0,
        "relative_speed": 1.2,
        "ttc": 12.5,
        "risk_score": 0.45,
        "risk_level": "MEDIUM",
        "recommended_action": "REDUCE SPEED",
        "sensor_health": {
            "radar": "SIMULATED",
            "thermal": "NOT_CONNECTED",
            "gnss": "SIMULATED",
            "imu": "SIMULATED",
        },
        "network_status": "STANDBY",
        "data_mode": "SIMULATION",
        "source_metadata": "CP7_WEBSOCKET_TEST",
    }

    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()  # discard ack

        # POST telemetry via API
        resp = client.post("/api/telemetry", json=sample_telemetry)
        assert resp.status_code == 201, f"POST failed: {resp.text}"

        # Receive broadcast on WebSocket
        msg = ws.receive_json()
        assert msg.get("type") == "telemetry", f"Expected type 'telemetry', got {msg}"
        broadcast_data = msg.get("data", {})
        assert broadcast_data.get("vehicle_id") == "HEMM-01"
        assert broadcast_data.get("risk_level") == "MEDIUM"
        assert broadcast_data.get("speed") == 26.0
        print(f"  -> WebSocket received broadcast: vehicle_id={broadcast_data['vehicle_id']}, risk={broadcast_data['risk_level']}")
        passed_criteria += 1

    # ------------------------------------------------------------------
    # 6. Database record verification
    # ------------------------------------------------------------------
    print("\n[Criterion 6/12] Verifying telemetry was committed to PostgreSQL/ledger...")
    with SessionLocal() as db:
        latest = TelemetryRepository.get_latest(db, "HEMM-01")
        assert latest is not None
        assert latest.speed == 26.0
        assert latest.object_distance == 68.0
        assert latest.source_metadata == "CP7_WEBSOCKET_TEST"
        print(f"  -> DB confirmed: Record ID={latest.id}, speed={latest.speed} km/h, distance={latest.object_distance}m")
        passed_criteria += 1

    # ------------------------------------------------------------------
    # 7. Payload strictly adheres to VehicleTelemetry contract
    # ------------------------------------------------------------------
    print("\n[Criterion 7/12] Verifying WebSocket payload adherence to VehicleTelemetry contract...")
    required_fields = [
        "vehicle_id", "vehicle_type", "timestamp", "position", "heading", "speed",
        "visibility_condition", "object_detected", "object_distance", "relative_speed",
        "ttc", "risk_score", "risk_level", "recommended_action", "sensor_health",
        "network_status", "data_mode", "source_metadata"
    ]
    for field in required_fields:
        assert field in broadcast_data, f"Missing contract field '{field}' in broadcast"
    assert "latitude" in broadcast_data["position"]
    assert "longitude" in broadcast_data["position"]
    assert "radar" in broadcast_data["sensor_health"]
    print(f"  -> All {len(required_fields)} contract fields present and validated.")
    passed_criteria += 1

    # ------------------------------------------------------------------
    # 8. Multiple clients receive the broadcasted telemetry
    # ------------------------------------------------------------------
    print("\n[Criterion 8/12] Testing multi-client simultaneous broadcast...")
    with client.websocket_connect("/ws/telemetry") as ws1:
        _ = ws1.receive_json()
        with client.websocket_connect("/ws/telemetry") as ws2:
            _ = ws2.receive_json()

            sample_t2 = dict(sample_telemetry, speed=30.0, timestamp="2026-09-11T12:00:01Z")
            resp = client.post("/api/telemetry", json=sample_t2)
            assert resp.status_code == 201

            msg1 = ws1.receive_json()
            msg2 = ws2.receive_json()
            assert msg1["data"]["speed"] == 30.0
            assert msg2["data"]["speed"] == 30.0
            print(f"  -> Broadcast successfully received by both client 1 and client 2.")
            passed_criteria += 1

    # ------------------------------------------------------------------
    # 9. Invariant: Database commit happens BEFORE broadcast
    # ------------------------------------------------------------------
    print("\n[Criterion 9/12] Verifying delivery invariant: DB commit strictly precedes broadcast...")
    # Test ordering by instrumenting broadcast to verify DB state at moment of broadcast
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()
        sample_t3 = dict(sample_telemetry, speed=33.0, timestamp="2026-09-11T12:00:02Z")

        # When broadcast is called, verify that DB already has the new record
        original_broadcast = ws_manager.broadcast_telemetry
        verified_db_at_broadcast = []

        async def monitored_broadcast(data):
            # Check DB right before message is pushed to network
            with SessionLocal() as db:
                rec = TelemetryRepository.get_latest(db, "HEMM-01")
                if rec and rec.speed == 33.0:
                    verified_db_at_broadcast.append(True)
                else:
                    verified_db_at_broadcast.append(False)
            await original_broadcast(data)

        ws_manager.broadcast_telemetry = monitored_broadcast
        try:
            resp = client.post("/api/telemetry", json=sample_t3)
            assert resp.status_code == 201
            _ = ws.receive_json()
            assert len(verified_db_at_broadcast) == 1 and verified_db_at_broadcast[0] is True, \
                "Record was not found in DB at the time broadcast was executed!"
            print("  -> INVARIANT VERIFIED: Database record existed and was committed before WebSocket broadcast.")
            passed_criteria += 1
        finally:
            ws_manager.broadcast_telemetry = original_broadcast

    # ------------------------------------------------------------------
    # 10. Database failure results in HTTP 503 and causes ZERO broadcasts
    # ------------------------------------------------------------------
    print("\n[Criterion 10/12] Testing database failure suppression (HTTP 503 -> 0 broadcasts)...")
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        # Mock database repository to simulate failure
        with patch("app.services.telemetry_service.TelemetryRepository.append") as mock_append:
            from sqlalchemy.exc import OperationalError
            mock_append.side_effect = OperationalError("INSERT INTO telemetry_events", {}, Exception("Disk full"))

            fail_sample = dict(sample_telemetry, speed=99.0, timestamp="2026-09-11T12:00:03Z")
            resp = client.post("/api/telemetry", json=fail_sample)
            assert resp.status_code == 503, f"Expected 503, got {resp.status_code}: {resp.text}"
            print(f"  -> API returned HTTP 503 as expected on DB failure: {resp.json()['detail']}")

            # Verify no broadcast was sent: sending a ping should return pong immediately without any intervening telemetry
            ws.send_text('{"type": "ping"}')
            response_after_fail = ws.receive_json()
            assert response_after_fail.get("type") == "pong", \
                f"Expected 'pong', but got spurious broadcast: {response_after_fail}"
            print("  -> CONFIRMED: Zero telemetry messages were broadcast during database failure.")
            passed_criteria += 1

    # ------------------------------------------------------------------
    # 11. Invalid vehicle returns HTTP 404 and causes ZERO broadcasts
    # ------------------------------------------------------------------
    print("\n[Criterion 11/12] Testing invalid vehicle rejection (HTTP 404 -> 0 broadcasts)...")
    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()

        invalid_sample = dict(sample_telemetry, vehicle_id="HEMM-999")
        resp = client.post("/api/telemetry", json=invalid_sample)
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

        ws.send_text('{"type": "ping"}')
        pong_res = ws.receive_json()
        assert pong_res.get("type") == "pong"
        print("  -> CONFIRMED: HTTP 404 on invalid vehicle, zero WebSocket broadcasts.")
        passed_criteria += 1

    # ------------------------------------------------------------------
    # 12. Lead vehicle HEMM-02 also broadcasts and persists
    # ------------------------------------------------------------------
    print("\n[Criterion 12/12] Testing HEMM-02 lead vehicle broadcast...")
    hemm02_sample = {
        "vehicle_id": "HEMM-02",
        "vehicle_type": "100T DUMPER (LEAD)",
        "timestamp": "2026-09-11T12:00:04Z",
        "position": {"latitude": 18.6520, "longitude": 81.2520, "altitude": 1040.0},
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
        "source_metadata": "CP7_LEAD_TEST",
    }

    with client.websocket_connect("/ws/telemetry") as ws:
        _ = ws.receive_json()
        resp = client.post("/api/telemetry", json=hemm02_sample)
        assert resp.status_code == 201
        msg = ws.receive_json()
        assert msg["data"]["vehicle_id"] == "HEMM-02"
        assert msg["data"]["risk_level"] == "LOW"
        print(f"  -> HEMM-02 telemetry broadcast received: {msg['data']['vehicle_id']}, speed={msg['data']['speed']}")
        passed_criteria += 1

    print("\n======================================================================")
    print(f"ALL CP7 WEBSOCKET TESTS PASSED: {passed_criteria}/12 CRITERIA SUCCESSFUL")
    print("======================================================================")


if __name__ == "__main__":
    run_cp7_tests()

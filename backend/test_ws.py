import asyncio, json, sys
import requests

try:
    import websockets
except ImportError as e:
    print('ERROR: websockets library not installed', e)
    sys.exit(1)

async def main():
    uri = "ws://127.0.0.1:8000/ws/telemetry"
    async with websockets.connect(uri) as websocket:
        # Receive connection ack
        ack = await websocket.recv()
        # Send a ping to keep alive
        await websocket.send(json.dumps({"type": "ping"}))
        pong = await websocket.recv()

        # Prepare telemetry payload for HEMM-02
        payload = {
            "vehicle_id": "HEMM-02",
            "vehicle_type": "100T DUMPER (FOLLOWING)",
            "timestamp": "2026-09-13T20:45:00Z",
            "position": {"latitude": 12.3457, "longitude": 78.9013, "altitude": 151.0},
            "heading": 90.0,
            "speed": 15.0,
            "visibility_condition": "NORMAL",
            "object_detected": False,
            "object_type": None,
            "object_distance": None,
            "relative_speed": None,
            "ttc": None,
            "risk_score": 0.0,
            "risk_level": "LOW",
            "recommended_action": "PROCEED",
            "sensor_health": {
                "radar": "HEALTHY",
                "thermal": "HEALTHY",
                "gnss": "HEALTHY",
                "imu": "HEALTHY"
            },
            "network_status": "ONLINE",
            "data_mode": "SIMULATION",
            "source_metadata": "ws-test",
            "route_distance": 0.0,
            "section_id": "SEC-01"
        }
        resp = requests.post("http://127.0.0.1:8000/api/telemetry", json=payload)
        print("POST STATUS:", resp.status_code)
        print("POST RESPONSE:", resp.json())

        # Await telemetry broadcast message
        message = await websocket.recv()
        print("WS MESSAGE:", message)
        try:
            data = json.loads(message)
            print("Parsed WS DATA:", data)
        except Exception as e:
            print("Failed to parse WS message", e)

if __name__ == "__main__":
    asyncio.run(main())

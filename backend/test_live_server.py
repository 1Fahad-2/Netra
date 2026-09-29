import httpx

BASE_URL = "http://127.0.0.1:8000"

def test_live():
    with httpx.Client(base_url=BASE_URL, timeout=5.0) as client:
        # 1. Health
        r = client.get("/health")
        print("GET /health ->", r.status_code, r.json())
        assert r.status_code == 200

        # 2. Vehicles
        r = client.get("/api/vehicles")
        print("GET /api/vehicles ->", r.status_code, [v["vehicle_id"] for v in r.json()])
        assert r.status_code == 200
        assert len(r.json()) == 2

        # 3. Vehicle by ID
        r = client.get("/api/vehicles/HEMM-01")
        print("GET /api/vehicles/HEMM-01 ->", r.status_code, r.json()["vehicle_id"])
        assert r.status_code == 200

        # 4. Unknown vehicle 404
        r = client.get("/api/vehicles/UNKNOWN-VEHICLE")
        print("GET /api/vehicles/UNKNOWN-VEHICLE ->", r.status_code, r.json()["detail"])
        assert r.status_code == 404

        # 5. Invalid telemetry 422
        r = client.post("/api/telemetry", json={"vehicle_id": "HEMM-01"})
        print("POST /api/telemetry (invalid) ->", r.status_code)
        assert r.status_code == 422

        # 5b. Seed telemetry for HEMM-02 (required for V2V pairing)
        telemetry_02 = {
            "vehicle_id": "HEMM-02",
            "vehicle_type": "100T DUMPER (LEAD)",
            "timestamp": "2026-09-11T02:12:00Z",
            "position": {"latitude": 18.6509, "longitude": 81.2463, "altitude": 1040.0},
            "heading": 148.0,
            "speed": 30.0,
            "visibility_condition": "NORMAL",
            "object_detected": False,
            "object_type": None,
            "object_distance": None,
            "relative_speed": None,
            "sensor_health": {"radar": "SIMULATED", "thermal": "SIMULATED", "gnss": "SIMULATED", "imu": "SIMULATED"},
            "network_status": "STANDBY",
            "data_mode": "SIMULATION",
            "source_metadata": "SIMULATED_DEMO_SCENARIO",
            "route_distance": 100.0,
            "section_id": "S01",
        }
        r = client.post("/api/telemetry", json=telemetry_02)
        print("POST /api/telemetry HEMM-02 ->", r.status_code, r.json())
        assert r.status_code == 201

        # 6. Valid telemetry POST
        telemetry = {
            "vehicle_id": "HEMM-01",
            "vehicle_type": "100T DUMPER (FOLLOWING)",
            "timestamp": "2026-09-11T02:11:00Z",
            "position": {"latitude": 18.6508, "longitude": 81.2462, "altitude": 1040.0},
            "heading": 148.0,
            "speed": 28.0,
            "visibility_condition": "NORMAL",
            "object_detected": True,
            "object_type": "HEMM-02",
            "object_distance": 18.5,
            "relative_speed": 2.4,
            "ttc": 7.7,
            "risk_score": 0.92,
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

            "route_distance": 100.0,
            "section_id": "S01",

        }
        r = client.post("/api/telemetry", json=telemetry)
        print("POST /api/telemetry ->", r.status_code, r.json())
        assert r.status_code == 201

        # 7. Get latest telemetry
        r = client.get("/api/telemetry/HEMM-01")
        print("GET /api/telemetry/HEMM-01 ->", r.status_code, "distance:", r.json()["object_distance"], "risk:", r.json()["risk_level"])
        assert r.status_code == 200

        # 8. Alerts
        r = client.get("/api/alerts")
        print("GET /api/alerts ->", r.status_code, len(r.json()), "alerts active:", r.json()[0]["title"])
        assert r.status_code == 200
        assert len(r.json()) >= 1

    print("\nALL LIVE SERVER TESTS PASSED PERFECTLY!")

if __name__ == "__main__":
    test_live()

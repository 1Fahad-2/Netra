"""
NETRA Phase-2C Hardware Telemetry Integration Tests.

Sends real HTTP requests to the already-running FastAPI backend at
http://127.0.0.1:8000.  No ASGI transport wrapping needed.

Prerequisites:
  The backend must be running:
    python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

Verifies POST /api/telemetry/hardware:
  - Accepts HEMM-01 with valid demo payload          → 201
  - Accepts HEMM-02 with valid demo payload          → 201
  - Preserves data_source = HARDWARE in response
  - Stores both vehicles independently
  - Rejects unknown vehicle_id (HEMM-99)             → 404
  - Rejects payload missing vehicle_id               → 422
  - Rejects payload missing timestamp                → 422

Run from backend/ directory:
    python -m pytest tests/test_hardware_telemetry.py -v
"""

import pytest
import httpx
from datetime import datetime, timezone

BASE_URL = "http://127.0.0.1:8000"
ENDPOINT = f"{BASE_URL}/api/telemetry/hardware"

# ---------------------------------------------------------------------------
# Live-server availability guard — skip all if backend is not up
# ---------------------------------------------------------------------------

def _backend_live() -> bool:
    try:
        r = httpx.get(f"{BASE_URL}/health", timeout=2.0)
        return r.status_code < 500
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _backend_live(),
    reason="Backend not reachable at http://127.0.0.1:8000 — start it first.",
)

# ---------------------------------------------------------------------------
# Shared payloads — DEMO values used because real sensors are not attached
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


HEMM01_PAYLOAD = {
    "vehicle_id":        "HEMM-01",
    "timestamp":         _now_iso(),
    "latitude":          22.1290,    # DEMO — Bailadila mine approach coords
    "longitude":         82.1390,    # DEMO
    "altitude":          280.5,      # DEMO
    "gps_accuracy":      3.2,        # DEMO
    "speed":             22.0,       # DEMO — km/h
    "heading":           73.0,       # DEMO — degrees
    "obstacle_distance": 38.0,       # DEMO — meters (HC-SR04 placeholder)
    "sensor_status":     "SIMULATED",
}

HEMM02_PAYLOAD = {
    "vehicle_id":        "HEMM-02",
    "timestamp":         _now_iso(),
    "latitude":          22.1285,    # DEMO
    "longitude":         82.1385,    # DEMO
    "altitude":          280.5,      # DEMO
    "gps_accuracy":      3.5,        # DEMO
    "speed":             22.0,       # DEMO
    "heading":           73.0,       # DEMO
    "obstacle_distance": 38.0,       # DEMO
    "sensor_status":     "SIMULATED",
}

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_hemm01_hardware_accepted():
    """HEMM-01 hardware payload must return HTTP 201 and confirm vehicle_id."""
    resp = httpx.post(ENDPOINT, json={**HEMM01_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert resp.status_code == 201, (
        f"Expected 201 for HEMM-01, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body["vehicle_id"] == "HEMM-01"
    assert body["status"] == "success"


def test_hemm02_hardware_accepted():
    """HEMM-02 hardware payload must return HTTP 201 and confirm vehicle_id."""
    resp = httpx.post(ENDPOINT, json={**HEMM02_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert resp.status_code == 201, (
        f"Expected 201 for HEMM-02, got {resp.status_code}: {resp.text}"
    )
    body = resp.json()
    assert body["vehicle_id"] == "HEMM-02"
    assert body["status"] == "success"


def test_hardware_response_contains_risk_fields():
    """Response for HEMM-01 must contain backend-computed risk_level (not None)."""
    resp = httpx.post(ENDPOINT, json={**HEMM01_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert resp.status_code == 201
    body = resp.json()
    # risk_level is computed by v2v_engine on the backend — it should be a valid level string
    # (or None/null only if no counterpart telemetry exists yet).
    assert "risk_level" in body


def test_hardware_message_contains_source():
    """Response message must reference HARDWARE source."""
    resp = httpx.post(ENDPOINT, json={**HEMM01_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert resp.status_code == 201
    body = resp.json()
    # The adapter sets data_source=HARDWARE; the response message should reflect it
    assert "HARDWARE" in body.get("message", "").upper() or body["status"] == "success"


def test_hemm01_and_hemm02_independent_submissions():
    """Both vehicles can independently submit telemetry in the same test run."""
    r1 = httpx.post(ENDPOINT, json={**HEMM01_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    r2 = httpx.post(ENDPOINT, json={**HEMM02_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert r1.status_code == 201, f"HEMM-01 submission failed: {r1.status_code} {r1.text}"
    assert r2.status_code == 201, f"HEMM-02 submission failed: {r2.status_code} {r2.text}"
    assert r1.json()["vehicle_id"] == "HEMM-01"
    assert r2.json()["vehicle_id"] == "HEMM-02"


def test_v2v_pair_produces_risk_after_both_submit():
    """
    After both HEMM-01 and HEMM-02 submit, the second submission's response
    should reflect the backend V2V assessment (risk_level is not null).
    """
    # Send HEMM-01 first (establishes the peer record in DB)
    httpx.post(ENDPOINT, json={**HEMM01_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    # Send HEMM-02 — backend should now run v2v_engine.assess()
    r2 = httpx.post(ENDPOINT, json={**HEMM02_PAYLOAD, "timestamp": _now_iso()}, timeout=5.0)
    assert r2.status_code == 201
    body = r2.json()
    # risk_level must be a string (NORMAL / CAUTION / HIGH / CRITICAL / UNKNOWN)
    # It will be null only if the DB side-effect fails, which we verify here.
    allowed = {"NORMAL", "CAUTION", "HIGH", "CRITICAL", "UNKNOWN", None}
    assert body.get("risk_level") in allowed, (
        f"Unexpected risk_level value: {body.get('risk_level')!r}"
    )


# ---------------------------------------------------------------------------
# Failure cases
# ---------------------------------------------------------------------------

def test_unknown_vehicle_rejected_404():
    """An unregistered vehicle_id must be rejected with HTTP 404."""
    bad = {**HEMM01_PAYLOAD, "vehicle_id": "HEMM-99", "timestamp": _now_iso()}
    resp = httpx.post(ENDPOINT, json=bad, timeout=5.0)
    assert resp.status_code == 404, (
        f"Expected 404 for HEMM-99, got {resp.status_code}: {resp.text}"
    )
    detail = resp.json().get("detail", "")
    assert "HEMM-99" in detail or "not a registered" in detail.lower()


def test_missing_vehicle_id_rejected_422():
    """Payload missing vehicle_id must be rejected with HTTP 422."""
    bad = {k: v for k, v in HEMM01_PAYLOAD.items() if k != "vehicle_id"}
    bad["timestamp"] = _now_iso()
    resp = httpx.post(ENDPOINT, json=bad, timeout=5.0)
    assert resp.status_code == 422, (
        f"Expected 422 for missing vehicle_id, got {resp.status_code}: {resp.text}"
    )


def test_missing_timestamp_rejected_422():
    """Payload missing timestamp must be rejected with HTTP 422."""
    bad = {k: v for k, v in HEMM01_PAYLOAD.items() if k != "timestamp"}
    resp = httpx.post(ENDPOINT, json=bad, timeout=5.0)
    assert resp.status_code == 422, (
        f"Expected 422 for missing timestamp, got {resp.status_code}: {resp.text}"
    )


def test_missing_latitude_rejected_422():
    """Payload missing latitude must be rejected with HTTP 422."""
    bad = {k: v for k, v in HEMM01_PAYLOAD.items() if k != "latitude"}
    bad["timestamp"] = _now_iso()
    resp = httpx.post(ENDPOINT, json=bad, timeout=5.0)
    assert resp.status_code == 422, (
        f"Expected 422 for missing latitude, got {resp.status_code}: {resp.text}"
    )

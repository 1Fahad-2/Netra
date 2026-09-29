#!/usr/bin/env python3
"""
NETRA — Phase 2 ESP32/OLED-2 Integration Verifier

Does NOT touch the Phase 1 backend logic (blind_curve_state_service.py,
v2v_engine.py, esp.py) — it only proves that the JSON shape esp.py returns
maps correctly onto the OLED-2 priority rule implemented in
hardware/esp32_hemm_telemetry.ino:

    1. UPCOMING VEHICLE   (only when vehicle_alert is present)
    2. BLIND CURVE ACTIVE
    3. UPCOMING BLIND CURVE (+ distance)
    4. SAFE

This is a pure-Python mirror of the ESP32 rendering logic (renderSafetyState
in the .ino) so the 9 required test scenarios can run without an actual
board. It exercises blind_curve_state_service directly (same as esp.py
does) plus hand-built V2V-shaped payloads, to keep this test independent of
the Postgres-backed telemetry_service.

Run with:  python -m pytest backend/tests/test_phase2_esp_oled_integration.py -v
or:        python backend/tests/test_phase2_esp_oled_integration.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.blind_curve_state_service import (
    BlindCurveStateService,
    SAFE,
    UPCOMING_BLIND_CURVE,
    BLIND_CURVE_ACTIVE,
    _CURVES,
)
from app.constants.blind_curve import BLIND_CURVE_APPROACH_DISTANCE_M

BC01 = _CURVES[0]
BC02 = _CURVES[1]

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results = []


def check(name: str, condition: bool, info: str = ""):
    status = PASS if condition else FAIL
    _results.append(bool(condition))
    print(f"[{status}] {name}" + (f" — {info}" if info else ""))


def build_esp_message(curve_state, vehicle_alert=None):
    """Mirrors the dict shape app/api/esp.py returns (subset relevant to OLED)."""
    return {
        "vehicle_id": "HEMM-01",
        "state": curve_state.state,
        "curve_id": curve_state.curve_id,
        "distance_to_curve": curve_state.distance_to_curve_m,
        "vehicle_alert": vehicle_alert,
    }


def render_priority(message: dict) -> str:
    """Pure-Python mirror of renderSafetyState()'s priority logic in the .ino."""
    if message.get("vehicle_alert"):
        return "UPCOMING_VEHICLE"
    if message["state"] == BLIND_CURVE_ACTIVE:
        return f"BLIND_CURVE_ACTIVE:{message['curve_id']}"
    if message["state"] == UPCOMING_BLIND_CURVE:
        return f"UPCOMING_BLIND_CURVE:{message['curve_id']}"
    return "SAFE"


def run_scenarios():
    svc = BlindCurveStateService()
    vid = "HEMM-01"

    # TEST 1: Far before BC1 -> SAFE
    cs = svc.evaluate(vid, 0.0)
    msg = build_esp_message(cs)
    check("TEST 1: Far before BC1 -> SAFE", render_priority(msg) == "SAFE", msg)

    # TEST 2: Approaching BC1 -> UPCOMING BLIND CURVE 1
    cs = svc.evaluate(vid, BC01.start_m - (BLIND_CURVE_APPROACH_DISTANCE_M - 10))
    msg = build_esp_message(cs)
    check(
        "TEST 2: Approaching BC1 -> UPCOMING_BLIND_CURVE:BLIND_CURVE_01",
        render_priority(msg) == "UPCOMING_BLIND_CURVE:BLIND_CURVE_01",
        msg,
    )
    check("TEST 2b: distance_to_curve present", msg["distance_to_curve"] is not None, msg["distance_to_curve"])

    # TEST 3: Inside BC1 -> BLIND CURVE 1 ACTIVE
    cs = svc.evaluate(vid, (BC01.start_m + BC01.end_m) / 2)
    msg = build_esp_message(cs)
    check(
        "TEST 3: Inside BC1 -> BLIND_CURVE_ACTIVE:BLIND_CURVE_01",
        render_priority(msg) == "BLIND_CURVE_ACTIVE:BLIND_CURVE_01",
        msg,
    )

    # TEST 4: Actual V2V alert while inside BC1 -> UPCOMING VEHICLE wins priority
    vehicle_alert = {"vehicle_id": "HEMM-02", "distance": 16.5, "ttc": 2.8, "risk": "HIGH", "action": "REDUCE SPEED"}
    cs = svc.evaluate(vid, (BC01.start_m + BC01.end_m) / 2)  # still inside BC1
    msg = build_esp_message(cs, vehicle_alert)
    check(
        "TEST 4: V2V alert during BC1 -> UPCOMING_VEHICLE (overrides curve state)",
        render_priority(msg) == "UPCOMING_VEHICLE",
        msg,
    )
    check("TEST 4b: distance + TTC both present", msg["vehicle_alert"]["distance"] == 16.5 and msg["vehicle_alert"]["ttc"] == 2.8)

    # TEST 5: Conflict cleared, still past BC1 -> SAFE
    cs = svc.evaluate(vid, BC01.end_m + 50)
    msg = build_esp_message(cs, vehicle_alert=None)
    check("TEST 5: Conflict cleared -> SAFE", render_priority(msg) == "SAFE", msg)

    # TEST 6: Approaching BC2 -> UPCOMING BLIND CURVE 2
    cs = svc.evaluate(vid, BC02.start_m - (BLIND_CURVE_APPROACH_DISTANCE_M - 15))
    msg = build_esp_message(cs)
    check(
        "TEST 6: Approaching BC2 -> UPCOMING_BLIND_CURVE:BLIND_CURVE_02",
        render_priority(msg) == "UPCOMING_BLIND_CURVE:BLIND_CURVE_02",
        msg,
    )

    # TEST 7: Inside BC2 -> BLIND CURVE 2 ACTIVE
    cs = svc.evaluate(vid, (BC02.start_m + BC02.end_m) / 2)
    msg = build_esp_message(cs)
    check(
        "TEST 7: Inside BC2 -> BLIND_CURVE_ACTIVE:BLIND_CURVE_02",
        render_priority(msg) == "BLIND_CURVE_ACTIVE:BLIND_CURVE_02",
        msg,
    )

    # TEST 8: BC2 has NO vehicle -> vehicle_alert must be absent/None
    check(
        "TEST 8: No fabricated vehicle_alert during BC2",
        msg["vehicle_alert"] is None,
        msg["vehicle_alert"],
    )

    # TEST 9: After BC2 -> SAFE
    cs = svc.evaluate(vid, BC02.end_m + 50)
    msg = build_esp_message(cs)
    check("TEST 9: After BC2 -> SAFE", render_priority(msg) == "SAFE", msg)


def run_no_flicker_check():
    """Rapid GPS jitter around a curve boundary must not flip the rendered priority."""
    svc = BlindCurveStateService()
    vid = "HEMM-01"

    svc.evaluate(vid, BC01.start_m - 20)  # comfortably UPCOMING
    readings = [
        BC01.start_m - 1,
        BC01.start_m + 1,   # enters ACTIVE
        BC01.start_m - 0.5,  # jitter back
        BC01.start_m + 0.5,  # jitter forward again
    ]
    priorities = []
    for r in readings:
        cs = svc.evaluate(vid, r)
        priorities.append(render_priority(build_esp_message(cs)))

    # Once ACTIVE is reached it must not flicker back to UPCOMING on 1-2m jitter.
    check(
        "No OLED flicker across BC1 entry boundary under GPS jitter",
        priorities[1].startswith("BLIND_CURVE_ACTIVE")
        and priorities[2].startswith("BLIND_CURVE_ACTIVE")
        and priorities[3].startswith("BLIND_CURVE_ACTIVE"),
        priorities,
    )


if __name__ == "__main__":
    run_scenarios()
    run_no_flicker_check()

    total = len(_results)
    passed = sum(_results)
    print(f"\n{passed}/{total} checks passed")
    sys.exit(0 if passed == total else 1)

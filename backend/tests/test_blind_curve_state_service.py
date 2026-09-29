#!/usr/bin/env python3
"""
NETRA — Phase 1 (Feature 11) Blind Curve State Machine Verifier

Exercises the exact scenario in the Phase 1 requirement:

  far from BC1            -> SAFE
  approaching BC1         -> UPCOMING_BLIND_CURVE (BLIND_CURVE_01), distance shown
  inside BC1              -> BLIND_CURVE_ACTIVE (BLIND_CURVE_01)
  cleared BC1             -> SAFE
  far from BC2            -> SAFE
  approaching BC2         -> UPCOMING_BLIND_CURVE (BLIND_CURVE_02), distance shown
  inside BC2               -> BLIND_CURVE_ACTIVE (BLIND_CURVE_02)
  boundary jitter          -> state does not flap

Run with:  python -m pytest backend/tests/test_blind_curve_state_service.py -v
or:        python backend/tests/test_blind_curve_state_service.py
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
from app.constants.blind_curve import (
    BLIND_CURVE_APPROACH_DISTANCE_M,
    BLIND_CURVE_STATE_HYSTERESIS_M,
)

BC01 = _CURVES[0]
BC02 = _CURVES[1]

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results = []


def check(name: str, condition: bool, info: str = ""):
    status = PASS if condition else FAIL
    _results.append(bool(condition))
    print(f"[{status}] {name}" + (f" — {info}" if info else ""))


def test_full_scenario():
    svc = BlindCurveStateService()
    vid = "HEMM-01"

    # 1. Far from BC01 -> SAFE
    r = svc.evaluate(vid, 0.0)
    check("Far from BC1 -> SAFE", r.state == SAFE, r.state)

    # 2. Approaching BC01 (within approach window) -> UPCOMING_BLIND_CURVE + distance
    approach_dist = BC01.start_m - (BLIND_CURVE_APPROACH_DISTANCE_M - 10)
    r = svc.evaluate(vid, approach_dist)
    check(
        "Approaching BC1 -> UPCOMING_BLIND_CURVE(BC01)",
        r.state == UPCOMING_BLIND_CURVE and r.curve_id == "BLIND_CURVE_01",
        r,
    )
    check("Distance to curve reported", r.distance_to_curve_m is not None and r.distance_to_curve_m > 0, r.distance_to_curve_m)

    # 3. Inside BC01 -> BLIND_CURVE_ACTIVE
    r = svc.evaluate(vid, (BC01.start_m + BC01.end_m) / 2)
    check(
        "Inside BC1 -> BLIND_CURVE_ACTIVE(BC01)",
        r.state == BLIND_CURVE_ACTIVE and r.curve_id == "BLIND_CURVE_01",
        r,
    )
    check("Distance is 0 while active", r.distance_to_curve_m == 0.0, r.distance_to_curve_m)

    # 4. Well clear of BC01 (past exit + hysteresis) -> SAFE
    r = svc.evaluate(vid, BC01.end_m + BLIND_CURVE_STATE_HYSTERESIS_M + 5)
    check("Cleared BC1 -> SAFE", r.state == SAFE, r.state)

    # 5. Far from BC02 (just clear of BC01, outside BC02's approach window) -> SAFE
    just_clear = BC01.end_m + BLIND_CURVE_STATE_HYSTERESIS_M + 5
    r = svc.evaluate(vid, just_clear)
    check(
        "Far from BC2 -> SAFE",
        r.state == SAFE and r.curve_id == "BLIND_CURVE_02" and just_clear < BC02.start_m - BLIND_CURVE_APPROACH_DISTANCE_M,
        r,
    )

    # 6. Approaching BC02 -> UPCOMING_BLIND_CURVE(BC02) + distance
    approach2 = BC02.start_m - (BLIND_CURVE_APPROACH_DISTANCE_M - 15)
    r = svc.evaluate(vid, approach2)
    check(
        "Approaching BC2 -> UPCOMING_BLIND_CURVE(BC02)",
        r.state == UPCOMING_BLIND_CURVE and r.curve_id == "BLIND_CURVE_02",
        r,
    )

    # 7. Inside BC02 -> BLIND_CURVE_ACTIVE(BC02)
    r = svc.evaluate(vid, (BC02.start_m + BC02.end_m) / 2)
    check(
        "Inside BC2 -> BLIND_CURVE_ACTIVE(BC02)",
        r.state == BLIND_CURVE_ACTIVE and r.curve_id == "BLIND_CURVE_02",
        r,
    )

    # 8. Past BC02 -> SAFE, no curve ahead
    r = svc.evaluate(vid, BC02.end_m + BLIND_CURVE_STATE_HYSTERESIS_M + 20)
    check("Cleared BC2, route ends -> SAFE, curve_id None", r.state == SAFE and r.curve_id is None, r)


def test_no_flap_at_entry_boundary():
    """GPS jitter right at the BC01 entry boundary must not flap the state."""
    svc = BlindCurveStateService()
    vid = "HEMM-01"

    # Get comfortably into UPCOMING first.
    svc.evaluate(vid, BC01.start_m - 20)
    r1 = svc.evaluate(vid, BC01.start_m - 1)   # just before entry -> still UPCOMING
    r2 = svc.evaluate(vid, BC01.start_m + 1)   # just past entry -> ACTIVE (upgrade, immediate)
    r3 = svc.evaluate(vid, BC01.start_m - 0.5)  # jitters back 1.5m -> should NOT drop out of ACTIVE
    check(
        "No flap across curve entry boundary",
        r1.state == UPCOMING_BLIND_CURVE and r2.state == BLIND_CURVE_ACTIVE and r3.state == BLIND_CURVE_ACTIVE,
        (r1.state, r2.state, r3.state),
    )


def test_no_flap_at_exit_boundary():
    """GPS jitter right at the BC01 exit boundary must not flap back to ACTIVE/SAFE repeatedly."""
    svc = BlindCurveStateService()
    vid = "HEMM-02"

    svc.evaluate(vid, (BC01.start_m + BC01.end_m) / 2)  # inside -> ACTIVE
    r1 = svc.evaluate(vid, BC01.end_m + 1)   # just past exit -> still gated ACTIVE (within hysteresis)
    r2 = svc.evaluate(vid, BC01.end_m - 1)   # jitters back inside -> still ACTIVE
    r3 = svc.evaluate(vid, BC01.end_m + BLIND_CURVE_STATE_HYSTERESIS_M + 1)  # clearly past -> downgrade allowed
    check(
        "No flap across curve exit boundary, then clean downgrade",
        r1.state == BLIND_CURVE_ACTIVE and r2.state == BLIND_CURVE_ACTIVE and r3.state != BLIND_CURVE_ACTIVE,
        (r1.state, r2.state, r3.state),
    )


def test_off_route_is_conservative():
    svc = BlindCurveStateService()
    r = svc.evaluate("HEMM-01", None)
    check("Off-route (None) -> SAFE, no fabricated curve", r.state == SAFE and r.curve_id is None, r)


def test_vehicles_are_independent():
    svc = BlindCurveStateService()
    svc.evaluate("HEMM-01", (BC01.start_m + BC01.end_m) / 2)  # HEMM-01 inside BC01
    r2 = svc.evaluate("HEMM-02", 0.0)  # HEMM-02 far away
    check(
        "Per-vehicle state is independent",
        r2.state == SAFE,
        r2.state,
    )


if __name__ == "__main__":
    test_full_scenario()
    test_no_flap_at_entry_boundary()
    test_no_flap_at_exit_boundary()
    test_off_route_is_conservative()
    test_vehicles_are_independent()

    total = len(_results)
    passed = sum(_results)
    print(f"\n{passed}/{total} checks passed")
    sys.exit(0 if passed == total else 1)

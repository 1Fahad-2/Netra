"""
NETRA — Feature 11 Full Journey Demo
====================================

Software-only full journey demonstration.

Sequence:
    SAFE
      ↓ 4 sec
    UPCOMING BLIND CURVE 1
      ↓ 4 sec
    APPROACHING VEHICLE
      ↓ 4 sec
    BLIND CURVE 1 ACTIVE
      ↓ 30 sec
    SAFE
      ↓ 10 sec
    UPCOMING BLIND CURVE 2
      ↓ 4 sec
    DEMO COMPLETE

The demo uses the EXISTING telemetry ingestion mechanism and the EXISTING
GET /api/esp/{vehicle_id}/safety-state endpoint.

It does NOT create a second safety-state API.

Run backend first:

    python -m uvicorn app.main:app --reload --port 8000

Then run:

    python app/demo_full_journey_demo.py

Or:

    $env:API_BASE_URL="http://127.0.0.1:8000"
    python app/demo_full_journey_demo.py
"""

import os
import sys
import pathlib
import time
import json
from datetime import datetime, timezone

# ---------------------------------------------------------
# Make backend/app importable
# ---------------------------------------------------------

sys.path.append(
    str(pathlib.Path(__file__).resolve().parent.parent)
)

import requests

from app.demo_v2v_demo import (
    send,
    reset_backend_state,
    BASE_TELEMETRY,
)

from app.services.blind_curve_state_service import (
    BC01_START_DIST_M,
    BC01_END_DIST_M,
    BC02_APPROACH_DIST_M,
    BC02_END_DIST_M,
)

from app.services.route_projector import _section_id_for_dist


# =========================================================
# CONFIGURATION
# =========================================================

API_BASE_URL = os.getenv(
    "API_BASE_URL",
    "http://127.0.0.1:8000"
).strip()

PASS = "PASS"
FAIL = "FAIL"

_results = []


# =========================================================
# DEMO TIMING
# =========================================================

SAFE_DURATION = 4

UPCOMING_BC1_DURATION = 4

APPROACHING_VEHICLE_DURATION = 4

BC1_ACTIVE_DURATION = 30

SAFE_AFTER_BC1_DURATION = 10

UPCOMING_BC2_DURATION = 4


# =========================================================
# HELPERS
# =========================================================

def check(name: str, condition: bool, info=""):
    """
    Store and print a test result.
    """

    _results.append(bool(condition))

    tag = PASS if condition else FAIL

    print(
        f"  [{tag}] {name}"
        + (f" — {info}" if info else "")
    )


def iso_now():
    """
    Return current UTC timestamp.
    """

    return datetime.now(timezone.utc).isoformat()


def post(
    vehicle_id: str,
    route_distance: float,
    speed: float = 20.0
):
    """
    Send telemetry through the EXISTING telemetry ingestion mechanism.
    """

    tele = BASE_TELEMETRY.copy()

    tele.update(
        {
            "timestamp": iso_now(),
            "speed": speed,
            "heading": 90,
            "route_distance": round(route_distance, 2),
            "section_id": _section_id_for_dist(route_distance),
        }
    )

    resp = send(vehicle_id, tele)

    assert resp.status_code in (
        200,
        201,
    ), f"{vehicle_id} POST failed: {resp.text}"

    return resp


def get_safety_state(
    vehicle_id: str = "HEMM-01"
):
    """
    Read the EXISTING ESP safety-state API.
    """

    resp = requests.get(
        f"{API_BASE_URL}/api/esp/{vehicle_id}/safety-state"
    )

    assert resp.status_code == 200, (
        f"GET safety-state failed: {resp.text}"
    )

    return resp.json()


def print_safety_state(state):
    """
    Print exactly what the ESP API is currently returning.
    """

    print()
    print("----------------------------------------")
    print("CURRENT ESP SAFETY STATE")
    print("----------------------------------------")

    print(
        json.dumps(
            state,
            indent=2
        )
    )

    print("----------------------------------------")
    print()


def stage(title: str):
    """
    Print a clearly visible demo stage.
    """

    print()
    print("=" * 60)
    print(title)
    print("=" * 60)


def countdown(
    seconds: int,
    message: str
):
    """
    Keep the current backend state alive for the requested
    amount of time.

    The telemetry state is NOT changed during this period.
    """

    print()
    print(message)

    for remaining in range(
        seconds,
        0,
        -1
    ):

        print(
            f"   State remains active for "
            f"{remaining:02d}s...",
            end="\r",
            flush=True
        )

        time.sleep(1)

    print(
        " " * 60,
        end="\r"
    )


# =========================================================
# MAIN JOURNEY
# =========================================================

def main():

    # -----------------------------------------------------
    # Reset previous demo state
    # -----------------------------------------------------

    reset_backend_state()

    # -----------------------------------------------------
    # Calculate blind curve positions
    # -----------------------------------------------------

    bc1_mid = (
        BC01_START_DIST_M
        + BC01_END_DIST_M
    ) / 2

    bc2_mid = (
        BC02_APPROACH_DIST_M
        + BC02_END_DIST_M
    ) / 2

    # -----------------------------------------------------
    # Keep HEMM-02 far away initially.
    # -----------------------------------------------------

    post(
        "HEMM-02",
        route_distance=1800.0,
        speed=15.0
    )

    # =====================================================
    # 1. SAFE
    # =====================================================

    stage(
        "1. HEMM-01 SAFE — FAR FROM BLIND CURVE 1"
    )

    post(
        "HEMM-01",
        route_distance=0.0,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "upcoming_hazard.status == SAFE",
        s["upcoming_hazard"]["status"] == "SAFE",
        s["upcoming_hazard"]
    )

    check(
        "SAFE section_id == null",
        s["upcoming_hazard"]["section_id"] is None,
        s["upcoming_hazard"]
    )

    countdown(
        SAFE_DURATION,
        "Keeping SAFE visible to dashboard + ESP32"
    )

    # =====================================================
    # 2. UPCOMING BLIND CURVE 1
    # =====================================================

    stage(
        "2. HEMM-01 UPCOMING BLIND CURVE 1"
    )

    post(
        "HEMM-01",
        route_distance=BC01_START_DIST_M - 60,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "upcoming_hazard.status == UPCOMING",
        s["upcoming_hazard"]["status"] == "UPCOMING",
        s["upcoming_hazard"]
    )

    check(
        "section_id == BLIND_CURVE_01",
        s["upcoming_hazard"]["section_id"]
        == "BLIND_CURVE_01",
        s["upcoming_hazard"]
    )

    check(
        "distance_m is present",
        s["upcoming_hazard"]["distance_m"]
        is not None,
        s["upcoming_hazard"]
    )

    countdown(
        UPCOMING_BC1_DURATION,
        "Keeping UPCOMING BLIND CURVE 1 visible"
    )

    # =====================================================
    # 3. APPROACHING VEHICLE
    # =====================================================

    stage(
        "3. HEMM-02 APPROACHING HEMM-01"
    )

    # Put HEMM-02 close enough to create V2V alert.
    post(
        "HEMM-02",
        route_distance=(
            BC01_START_DIST_M - 60 - 16.66
        ),
        speed=35.0
    )

    # Refresh HEMM-01 so V2V engine evaluates HEMM-02.
    post(
        "HEMM-01",
        route_distance=BC01_START_DIST_M - 60,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "approaching_vehicle.detected == true",
        s["approaching_vehicle"]["detected"] is True,
        s["approaching_vehicle"]
    )

    va = s["approaching_vehicle"]

    check(
        "approaching_vehicle.object_type == HEMM-02",
        va.get("object_type") == "HEMM-02",
        va.get("object_type")
    )

    check(
        "approaching_vehicle.distance present",
        va.get("distance_m") is not None,
        va.get("distance_m")
    )

    check(
        "approaching_vehicle.risk present",
        va.get("risk_level")
        in (
            "CAUTION",
            "HIGH",
            "CRITICAL",
        ),
        va.get("risk_level")
    )

    check(
        "approaching_vehicle.ttc field present",
        "ttc_s" in va,
        va.get("ttc_s")
    )

    countdown(
        APPROACHING_VEHICLE_DURATION,
        "Keeping approaching-vehicle warning visible"
    )

    # =====================================================
    # 4. BLIND CURVE 1 ACTIVE
    # =====================================================

    stage(
        "4. HEMM-01 ENTERS BLIND CURVE 1 — ACTIVE"
    )

    # Move HEMM-02 away first so only the blind curve
    # hazard remains active.
    post(
        "HEMM-02",
        route_distance=1800.0,
        speed=35.0
    )

    # Put HEMM-01 physically inside BC1.
    post(
        "HEMM-01",
        route_distance=bc1_mid,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "upcoming_hazard.status == ACTIVE",
        s["upcoming_hazard"]["status"] == "ACTIVE",
        s["upcoming_hazard"]
    )

    check(
        "section_id == BLIND_CURVE_01",
        s["upcoming_hazard"]["section_id"]
        == "BLIND_CURVE_01",
        s["upcoming_hazard"]
    )

    check(
        "approaching_vehicle cleared",
        s["approaching_vehicle"]["detected"]
        is False,
        s["approaching_vehicle"]
    )

    countdown(
        BC1_ACTIVE_DURATION,
        "Keeping BLIND CURVE 1 ACTIVE for 30 seconds"
    )

    # =====================================================
    # 5. SAFE AFTER BLIND CURVE 1
    # =====================================================

    stage(
        "5. HEMM-01 LEAVES BLIND CURVE 1 — SAFE"
    )

    post(
        "HEMM-01",
        route_distance=BC01_END_DIST_M + 80,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "upcoming_hazard.status == SAFE",
        s["upcoming_hazard"]["status"] == "SAFE",
        s["upcoming_hazard"]
    )

    check(
        "SAFE section_id == null",
        s["upcoming_hazard"]["section_id"] is None,
        s["upcoming_hazard"]
    )

    countdown(
        SAFE_AFTER_BC1_DURATION,
        "Keeping SAFE visible after BLIND CURVE 1"
    )

    # =====================================================
    # 6. UPCOMING BLIND CURVE 2
    # =====================================================

    stage(
        "6. HEMM-01 UPCOMING BLIND CURVE 2"
    )

    post(
        "HEMM-01",
        route_distance=BC02_APPROACH_DIST_M - 60,
        speed=20.0
    )

    s = get_safety_state(
        "HEMM-01"
    )

    print_safety_state(s)

    check(
        "upcoming_hazard.status == UPCOMING",
        s["upcoming_hazard"]["status"] == "UPCOMING",
        s["upcoming_hazard"]
    )

    check(
        "section_id == BLIND_CURVE_02",
        s["upcoming_hazard"]["section_id"]
        == "BLIND_CURVE_02",
        s["upcoming_hazard"]
    )

    check(
        "distance_m is present",
        s["upcoming_hazard"]["distance_m"]
        is not None,
        s["upcoming_hazard"]
    )

    countdown(
        UPCOMING_BC2_DURATION,
        "Keeping UPCOMING BLIND CURVE 2 visible"
    )

    # =====================================================
    # FINAL RESULT
    # =====================================================

    total = len(_results)
    passed = sum(_results)

    print()
    print("=" * 60)
    print(
        f"JOURNEY RESULT: {passed}/{total} CHECKS PASSED"
    )
    print("=" * 60)

    if passed == total:

        print()
        print(
            "FULL JOURNEY DEMO PASSED"
        )

        print()
        print(
            "Final sequence demonstrated:"
        )

        print(
            "SAFE -> "
            "UPCOMING BC1 -> "
            "APPROACHING VEHICLE -> "
            "BC1 ACTIVE -> "
            "SAFE -> "
            "UPCOMING BC2"
        )

        print()
        print(
            "Timing:"
        )

        print(
            f"SAFE                    : {SAFE_DURATION}s"
        )

        print(
            f"UPCOMING BC1            : "
            f"{UPCOMING_BC1_DURATION}s"
        )

        print(
            f"APPROACHING VEHICLE     : "
            f"{APPROACHING_VEHICLE_DURATION}s"
        )

        print(
            f"BC1 ACTIVE              : "
            f"{BC1_ACTIVE_DURATION}s"
        )

        print(
            f"SAFE AFTER BC1          : "
            f"{SAFE_AFTER_BC1_DURATION}s"
        )

        print(
            f"UPCOMING BC2            : "
            f"{UPCOMING_BC2_DURATION}s"
        )

        print()

        return True

    else:

        print()
        print(
            "FULL JOURNEY DEMO FAILED"
        )

        return False


# =========================================================
# ENTRY POINT
# =========================================================

if __name__ == "__main__":

    try:

        print()
        print("=" * 60)
        print("NETRA FULL JOURNEY DEMO")
        print("=" * 60)

        print(
            f"API_BASE_URL = {API_BASE_URL}"
        )

        print()
        print("Timing:")
        print(
            f"SAFE -> {SAFE_DURATION}s -> "
            f"UPCOMING BC1 -> "
            f"{UPCOMING_BC1_DURATION}s -> "
            f"APPROACHING VEHICLE -> "
            f"{APPROACHING_VEHICLE_DURATION}s -> "
            f"BC1 ACTIVE -> "
            f"{BC1_ACTIVE_DURATION}s -> "
            f"SAFE -> "
            f"{SAFE_AFTER_BC1_DURATION}s -> "
            f"UPCOMING BC2 -> "
            f"{UPCOMING_BC2_DURATION}s"
        )

        print("=" * 60)

        ok = main()

        sys.exit(
            0 if ok else 1
        )

    except KeyboardInterrupt:

        print()
        print()
        print(
            "DEMO STOPPED BY USER."
        )

        sys.exit(1)

    except Exception as e:

        print()
        print(
            f"[FULL JOURNEY DEMO] ERROR: {e}"
        )

        raise
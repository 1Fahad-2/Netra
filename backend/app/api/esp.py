"""
NETRA — ESP32 Blind-Curve Safety-State API

The ESP32 receives ONLY the blind-curve state calculated by the
existing backend route-position logic.

The backend determines:
    SAFE
    UPCOMING_BLIND_CURVE
    BLIND_CURVE_ACTIVE

The ESP32 does not calculate distances or hazard states.

No new database table, migration, telemetry computation, or V2V logic
is introduced here.
"""

from fastapi import APIRouter, HTTPException, status

from app.services.telemetry_service import telemetry_service
from app.services.blind_curve_state_service import (
    blind_curve_state_service,
    BLIND_CURVE_ACTIVE,
    UPCOMING_BLIND_CURVE,
)

router = APIRouter(
    prefix="/api/esp",
    tags=["ESP32"],
)


def _curve_number_label(curve_id: str | None) -> str:
    """
    Convert:
        BLIND_CURVE_01 -> 1
        BLIND_CURVE_02 -> 2

    Returns an empty string if the curve ID is missing.
    """
    if not curve_id:
        return ""

    tail = curve_id.rsplit("_", 1)[-1]

    if tail.isdigit():
        return str(int(tail))

    return tail


@router.get("/{vehicle_id}/safety-state")
async def get_safety_state(vehicle_id: str):
    """
    Return ONLY the blind-curve safety state required by ESP32.

    Possible states:

        SAFE

        UPCOMING BLIND CURVE
        with curve number + distance

        BLIND CURVE ACTIVE
        with curve number

    The state is calculated from the vehicle's existing
    route_distance through blind_curve_state_service.
    """

    clean_id = vehicle_id.upper()

    # ---------------------------------------------------------
    # 1. VERIFY VEHICLE
    # ---------------------------------------------------------

    if not telemetry_service.get_vehicle(clean_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Vehicle '{vehicle_id}' not found. "
                "Registered prototypes are HEMM-01 and HEMM-02."
            ),
        )

    # ---------------------------------------------------------
    # 2. GET LATEST TELEMETRY
    # ---------------------------------------------------------

    telemetry = telemetry_service.get_latest_telemetry(clean_id)

    if not telemetry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No telemetry has been recorded yet "
                f"for vehicle '{vehicle_id}'."
            ),
        )

    # ---------------------------------------------------------
    # 3. CALCULATE BLIND-CURVE STATE
    #
    # IMPORTANT:
    # This uses the SAME existing route_distance that the
    # software/dashboard already uses.
    #
    # No V2V data is used here.
    # No approaching-vehicle detection is used here.
    # ---------------------------------------------------------

    curve_state = blind_curve_state_service.evaluate(
        clean_id,
        telemetry.route_distance,
    )

    # ---------------------------------------------------------
    # 4. DETERMINE HUMAN-READABLE STATE
    # ---------------------------------------------------------

    if curve_state.state == BLIND_CURVE_ACTIVE:

        curve_number = _curve_number_label(
            curve_state.curve_id
        )

        hazard_state = (
            f"BLIND CURVE {curve_number} ACTIVE"
        )

    elif curve_state.state == UPCOMING_BLIND_CURVE:

        curve_number = _curve_number_label(
            curve_state.curve_id
        )

        hazard_state = (
            f"UPCOMING BLIND CURVE {curve_number}"
        )

    else:

        hazard_state = "SAFE"

    # ---------------------------------------------------------
    # 5. ESP32 RESPONSE
    #
    # ONLY BLIND-CURVE INFORMATION IS SENT.
    #
    # No:
    #   approaching_vehicle
    #   vehicle_alert
    #   V2V risk
    #   TTC
    #   object_type
    #   recommended_action
    # ---------------------------------------------------------

    # ---------------------------------------------------------
    # 5. BUILD THE HARDWARE-FACING HAZARD CONTRACT
    #
    # SAFE intentionally does not expose the distance to the next
    # curve. The ESP only needs a distance when a warning is active.
    # ---------------------------------------------------------
    is_upcoming = curve_state.state == UPCOMING_BLIND_CURVE
    is_active = curve_state.state == BLIND_CURVE_ACTIVE

    if is_active:
        hazard_status = "ACTIVE"
    elif is_upcoming:
        hazard_status = "UPCOMING"
    else:
        hazard_status = "SAFE"

    approaching_risk_levels = {"CAUTION", "HIGH", "CRITICAL"}
    risk_level = str(getattr(telemetry.risk_level, "value", telemetry.risk_level or "NORMAL")).upper()

    # object_detected alone is not enough to raise an approaching-vehicle
    # warning: the existing V2V engine must have elevated the stored risk.
    approaching_detected = (
        bool(telemetry.object_detected)
        and risk_level in approaching_risk_levels
    )

    if approaching_detected:
        approaching_vehicle = {
            "detected": True,
            "object_type": telemetry.object_type or "UNKNOWN",
            "distance_m": telemetry.object_distance,
            "ttc_s": telemetry.ttc,
            "risk_level": risk_level,
        }
    else:
        approaching_vehicle = {
            "detected": False,
            "object_type": "NONE",
            "distance_m": None,
            "ttc_s": None,
            "risk_level": "NORMAL",
        }

    return {
        "vehicle_id": telemetry.vehicle_id,

        "upcoming_hazard": {
            "type": "BLIND_CURVE" if (is_upcoming or is_active) else "NONE",
            "active": is_active,
            "status": hazard_status,
            "section_id": curve_state.curve_id if (is_upcoming or is_active) else None,
            "distance_m": (
                curve_state.distance_to_curve_m
                if (is_upcoming or is_active)
                else None
            ),
        },

        "approaching_vehicle": approaching_vehicle,

        "recommended_action": (
            str(getattr(telemetry.recommended_action, "value", telemetry.recommended_action or "PROCEED"))
        ),

        "timestamp": telemetry.timestamp,

        # Backward-compatible fields for the existing ESP32 firmware and
        # any current local demo tooling. These can be removed only after
        # all hardware consumers have migrated to upcoming_hazard.
        "hazard_state": hazard_state,
        "blind_curve": {
            "active": is_active,
            "upcoming": is_upcoming,
            "curve_id": curve_state.curve_id,
            "distance_m": curve_state.distance_to_curve_m,
        },
    }

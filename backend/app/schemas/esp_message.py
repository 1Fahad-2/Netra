"""
NETRA — Compact ESP32 Safety Message Contract (Phase 1, Feature 11)

Minimal data contract that CAN eventually be sent to the ESP32/OLED-2 over
the existing Wi-Fi channel (app/api/esp.py is already polled by the ESP32
firmware — see hardware/esp32_hemm_telemetry/esp32_hemm_telemetry.ino).

No physical transport (LoRa, MQTT, etc.) is implemented here — this is the
message shape only, matching the Phase 1 requirement.
"""

from typing import Optional
from pydantic import BaseModel, Field


class VehicleAlert(BaseModel):
    """Vehicle-conflict portion of the message.

    Populated ONLY from the existing V2V engine's output already stored on
    the telemetry record (app/services/v2v_engine.py via
    telemetry_service.record_telemetry). Never fabricated — if the V2V
    engine has not flagged a real conflict, this is left as None.
    """

    vehicle_id: Optional[str] = Field(None, description="Other vehicle involved, e.g. HEMM-02")
    distance: Optional[float] = Field(None, description="Route gap to the other vehicle, metres")
    ttc: Optional[float] = Field(None, description="Time-to-collision, seconds")
    risk: Optional[str] = Field(None, description="V2V risk level, e.g. CAUTION / HIGH / CRITICAL")
    action: Optional[str] = Field(None, description="Recommended operator action")


class EspSafetyMessage(BaseModel):
    """Compact safety-state message for the ESP32/OLED-2 hardware.

    Minimum required fields per the Phase 1 spec: vehicle_id, state,
    curve_id, distance_to_curve. vehicle_alert is included when (and only
    when) the existing V2V engine reports an active conflict.
    """

    vehicle_id: str
    state: str = Field(..., description="SAFE | UPCOMING_BLIND_CURVE | BLIND_CURVE_ACTIVE")
    curve_id: Optional[str] = Field(None, description="BLIND_CURVE_01 | BLIND_CURVE_02 | null")
    distance_to_curve: Optional[float] = Field(
        None, description="Metres to the curve entry; 0 while inside; null when none ahead"
    )
    vehicle_alert: Optional[VehicleAlert] = Field(
        None, description="Present only when the existing V2V engine reports an active conflict"
    )
    timestamp: str

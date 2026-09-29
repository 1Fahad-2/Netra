"""
NETRA — Compact Event Contract (Phase 2A add-on)

A lightweight, edge/LoRa-oriented event representation derived from the
existing VehicleTelemetry contract (frontend/src/types/contract.ts ==
app/schemas/telemetry.py::VehicleTelemetry).

Scope (deliberately small):
  - This is a PURE ADAPTER layer on top of the existing telemetry contract.
  - It does NOT change risk/safety logic, scoring, or thresholds.
  - It does NOT change route projection or any frozen route coordinates.
  - It does NOT implement real LoRa hardware or Store-and-Forward.
  - sensor_health / network_status / edge_processed are simulated constants
    for this prototype, as scoped by the feature request.

Field mapping (VehicleTelemetry -> CompactEvent):
  vehicle_id          <- vehicle_id
  timestamp           <- timestamp
  gps.lat / gps.lon   <- position.latitude / position.longitude
  speed               <- speed
  risk_level          <- risk_level (fallback UNKNOWN — value unchanged, not recomputed)
  risk_type           <- derived, read-only classification of the *kind* of risk
                         (see classify_risk_type). Purely descriptive; does not
                         feed back into risk_level/risk_score.
  confidence          <- risk_score (0.0-1.0), fallback 0.0
  distance_m          <- object_distance
  ttc_s               <- ttc
  recommended_action  <- recommended_action (fallback NOT AVAILABLE)
  sensor_health       <- simulated per-sensor status map (prototype constant,
                         every sensor reports "OK"; real hardware health
                         reporting is out of scope for this feature — see
                         Feature 2 additions below)
  network_status      <- "LORA" (prototype constant; real LoRa transport is
                         out of scope for this feature)
  edge_processed      <- True (prototype constant)

Feature 2 — Sensor Health Validation add-on:
  - Extends sensor_health from a bare string into a typed, validated
    per-sensor status structure (CompactSensorHealth) covering: lidar,
    ultrasonic, camera, bh1750, mpu6050, gnss, lora.
  - Allowed statuses: OK, WARNING, FAILED, UNKNOWN (SensorHealthStatus).
  - Pydantic enforces these at the model boundary, so an invalid sensor
    status (unknown sensor value or unknown status string) is rejected with
    a ValidationError rather than silently accepted.
  - Does NOT change safety thresholds or risk calculations, does NOT build
    the sensor health dashboard, and does NOT implement real hardware
    detection — current simulated values (all "OK") keep working unchanged.

Feature 7 — Final Risk + Recommendation add-on:
  - Adds ONE new optional field, `final_risk`, populated from the existing
    RiskRecommendationIntegrationService (Feature 6). Defaults to None, so
    every existing CompactEvent construction site keeps working unchanged.
  - `recommended_action`'s type is widened from RecommendedAction to `str`
    so it can also hold the richer recommendation strings produced by the
    existing RecommendationService (Feature 5) — e.g. "MAINTAIN SAFE SPEED",
    "HOLD / STOP", "MONITOR" — which are not members of RecommendedAction.
    RecommendedAction is itself a str-based enum, so every existing value
    (e.g. RecommendedAction.PROCEED) still round-trips and compares equal
    exactly as before; nothing that already sets/reads this field changes
    behavior.
  - `to_compact_event()` (the existing telemetry adapter) is UNCHANGED: it
    still sets `recommended_action` from `telemetry.recommended_action`
    and never sets `final_risk`, so its output and its existing tests are
    unaffected.
  - New, additive-only helpers:
      attach_final_risk_recommendation(event, edge_risk, v2v_risk)
          Calls the existing RiskRecommendationIntegrationService using the
          event's own GPS, then returns a COPY of `event` with `final_risk`
          and `recommended_action` set from that service's result. Does not
          mutate the input event or touch any other field.
      to_compact_event_with_final_risk(telemetry, edge_risk, v2v_risk)
          Convenience wrapper: to_compact_event() + attach_final_risk_recommendation()
          in one call.
  - No risk/recommendation logic is duplicated here — both helpers only
    call the existing RiskRecommendationIntegrationService singleton.
"""

from enum import StrEnum
from typing import Optional
from pydantic import BaseModel, Field

from app.schemas.telemetry import VehicleTelemetry, RiskLevel, RecommendedAction
from app.services.risk_recommendation_integration_service import (
    RiskRecommendationIntegrationService,
    risk_recommendation_integration_service,
)


class CompactGps(BaseModel):
    lat: float
    lon: float


class SensorHealthStatus(StrEnum):
    """Allowed health statuses for an individual Compact Event sensor."""

    OK = "OK"
    WARNING = "WARNING"
    FAILED = "FAILED"
    UNKNOWN = "UNKNOWN"


class CompactSensorHealth(BaseModel):
    """
    Per-sensor health for the Compact Event contract.

    Every field is required and must be one of SensorHealthStatus; Pydantic
    rejects (with a ValidationError) any missing sensor or any status value
    outside {OK, WARNING, FAILED, UNKNOWN}, so invalid sensor-health payloads
    are handled safely rather than silently accepted.
    """

    lidar: SensorHealthStatus
    ultrasonic: SensorHealthStatus
    camera: SensorHealthStatus
    bh1750: SensorHealthStatus
    mpu6050: SensorHealthStatus
    gnss: SensorHealthStatus
    lora: SensorHealthStatus


class CompactEvent(BaseModel):
    """Compact wire event — small enough for constrained/LoRa-class links."""

    vehicle_id: str
    timestamp: str
    gps: CompactGps
    speed: float
    risk_level: RiskLevel
    risk_type: str = Field(
        ..., description="Descriptive classification of the risk source. Does not alter risk_level/risk_score."
    )
    confidence: float = Field(..., ge=0.0, le=1.0, description="Mirrors existing risk_score; not recomputed.")
    distance_m: Optional[float] = None
    ttc_s: Optional[float] = None
    recommended_action: str = Field(
        ...,
        description=(
            "Recommended operator action. Historically one of RecommendedAction's values "
            "(e.g. from to_compact_event()); may also hold the richer RecommendationService "
            "strings (e.g. 'MAINTAIN SAFE SPEED', 'HOLD / STOP', 'MONITOR') when set via "
            "attach_final_risk_recommendation() / to_compact_event_with_final_risk() (Feature 7)."
        ),
    )
    sensor_health: CompactSensorHealth = Field(
        ..., description="Simulated per-sensor health for this prototype (currently all 'OK')."
    )
    network_status: str = Field(..., description="Simulated transport label for this prototype (e.g. 'LORA').")
    edge_processed: bool = Field(..., description="Simulated flag for this prototype.")
    final_risk: Optional[RiskLevel] = Field(
        None,
        description=(
            "Fused final risk level from the existing RiskRecommendationIntegrationService "
            "(Feature 6), set via attach_final_risk_recommendation() / "
            "to_compact_event_with_final_risk() (Feature 7). None when not computed for this "
            "event — existing events are unaffected."
        ),
    )


def build_simulated_sensor_health() -> CompactSensorHealth:
    """
    Build the simulated, all-healthy sensor_health map used by this
    prototype. Keeps the current simulated behavior (every sensor "OK")
    working while giving it a proper, validated shape. Real hardware health
    reporting remains out of scope for this feature.
    """
    return CompactSensorHealth(
        lidar=SensorHealthStatus.OK,
        ultrasonic=SensorHealthStatus.OK,
        camera=SensorHealthStatus.OK,
        bh1750=SensorHealthStatus.OK,
        mpu6050=SensorHealthStatus.OK,
        gnss=SensorHealthStatus.OK,
        lora=SensorHealthStatus.OK,
    )


def classify_risk_type(telemetry: VehicleTelemetry) -> str:
    """
    Derive a coarse, human-readable risk *type* label from EXISTING telemetry
    fields only. This is purely descriptive metadata for the compact event —
    it does not read/write risk_level, risk_score, or any threshold, and it
    must never be used to recompute or override the existing safety decision.
    """
    if telemetry.risk_level is None or telemetry.risk_level == RiskLevel.UNKNOWN:
        return "UNKNOWN"
    if not telemetry.object_detected:
        return "NONE"
    if telemetry.object_type and str(telemetry.object_type).upper().startswith("HEMM"):
        return "V2V_HEAD_ON"
    return "OBJECT_PROXIMITY"


def to_compact_event(telemetry: VehicleTelemetry) -> CompactEvent:
    """
    Adapt an existing VehicleTelemetry record into the Compact Event contract.

    Pure function: reads `telemetry`, never mutates it, and never recomputes
    risk/safety values — it only reshapes fields that already exist on the
    telemetry contract into the smaller wire format above.
    """
    return CompactEvent(
        vehicle_id=telemetry.vehicle_id,
        timestamp=telemetry.timestamp,
        gps=CompactGps(lat=telemetry.position.latitude, lon=telemetry.position.longitude),
        speed=telemetry.speed,
        risk_level=telemetry.risk_level or RiskLevel.UNKNOWN,
        risk_type=classify_risk_type(telemetry),
        confidence=telemetry.risk_score if telemetry.risk_score is not None else 0.0,
        distance_m=telemetry.object_distance,
        ttc_s=telemetry.ttc,
        recommended_action=telemetry.recommended_action or RecommendedAction.NOT_AVAILABLE,
        sensor_health=build_simulated_sensor_health(),
        network_status="LORA",
        edge_processed=True,
    )


def attach_final_risk_recommendation(
    event: CompactEvent,
    edge_risk: Optional[RiskLevel] = None,
    v2v_risk: Optional[RiskLevel] = None,
    integration_service: RiskRecommendationIntegrationService = risk_recommendation_integration_service,
) -> CompactEvent:
    """
    Return a COPY of `event` with `final_risk` and `recommended_action` set
    from the existing RiskRecommendationIntegrationService (Feature 6).

    Pure function: never mutates `event`. Every other field (vehicle_id,
    timestamp, gps, speed, risk_type, confidence, distance_m, ttc_s,
    sensor_health, network_status, edge_processed, risk_level) is carried
    over unchanged from the input event.

    - Uses the event's own `gps.lat` / `gps.lon` as the location input.
    - `edge_risk` / `v2v_risk` are optional pass-throughs to the
      integration service; when omitted, the service treats them as
      UNKNOWN, exactly as RiskIntegrationService already does.
    - Does NOT recompute or duplicate any risk/fusion/recommendation
      logic — it only calls the existing service and copies its result
      onto the event.
    """
    result = integration_service.assess(
        latitude=event.gps.lat,
        longitude=event.gps.lon,
        edge_risk=edge_risk,
        v2v_risk=v2v_risk,
    )
    return event.model_copy(
        update={
            "final_risk": result.final_risk,
            "recommended_action": result.recommended_action,
        }
    )


def to_compact_event_with_final_risk(
    telemetry: VehicleTelemetry,
    edge_risk: Optional[RiskLevel] = None,
    v2v_risk: Optional[RiskLevel] = None,
) -> CompactEvent:
    """
    Convenience wrapper: build a CompactEvent from `telemetry` exactly as
    `to_compact_event()` already does, then enrich it with `final_risk` and
    `recommended_action` from the existing RiskRecommendationIntegrationService
    via `attach_final_risk_recommendation()`.

    All other fields keep the same values `to_compact_event()` already
    produces for this telemetry.
    """
    return attach_final_risk_recommendation(
        to_compact_event(telemetry),
        edge_risk=edge_risk,
        v2v_risk=v2v_risk,
    )

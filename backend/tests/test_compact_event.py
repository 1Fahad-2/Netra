"""
Minimal tests for the Compact Event contract + adapter (Phase 2A add-on).

Verifies:
  - The adapter reshapes EXISTING VehicleTelemetry fields into CompactEvent
    without recomputing or altering risk_level / risk_score / thresholds.
  - The prototype-scoped constants (sensor_health, network_status,
    edge_processed) are set as specified.
  - risk_type classification is derived only from existing fields and is
    purely descriptive (it never mutates the source telemetry).

This does NOT test simulation physics, route projection, or V2V risk logic —
those are unchanged and covered by their own existing test suites.
"""

from app.schemas.telemetry import (
    VehicleTelemetry,
    Position3D,
    SensorHealthRecord,
    RiskLevel,
    RecommendedAction,
    VisibilityCondition,
    NetworkStatus,
    DataMode,
)
from app.schemas.compact_event import (
    to_compact_event,
    classify_risk_type,
    CompactSensorHealth,
    SensorHealthStatus,
)


def _sample_telemetry(**overrides) -> VehicleTelemetry:
    base = dict(
        vehicle_id="HEMM-01",
        vehicle_type="100T DUMPER (FORWARD)",
        timestamp="2026-01-01T00:00:00.000Z",
        position=Position3D(latitude=18.61, longitude=81.23, altitude=1040),
        heading=90,
        speed=25,
        visibility_condition=VisibilityCondition.NORMAL,
        object_detected=True,
        object_type="HEMM-02",
        object_distance=15.0,
        relative_speed=5.0,
        ttc=3.0,
        risk_score=0.75,
        risk_level=RiskLevel.HIGH,
        recommended_action=RecommendedAction.REDUCE_SPEED,
        sensor_health=SensorHealthRecord(
            radar="SIMULATED", thermal="NOT_CONNECTED", gnss="SIMULATED", imu="SIMULATED"
        ),
        network_status=NetworkStatus.STANDBY,
        data_mode=DataMode.SIMULATION,
        source_metadata="SIMULATED_DEMO_SCENARIO_PHASE2D",
        route_distance=120.0,
        section_id="SEC-01",
    )
    base.update(overrides)
    return VehicleTelemetry(**base)


def test_to_compact_event_preserves_core_fields():
    t = _sample_telemetry()
    ce = to_compact_event(t)
    assert ce.vehicle_id == t.vehicle_id
    assert ce.timestamp == t.timestamp
    assert ce.gps.lat == t.position.latitude
    assert ce.gps.lon == t.position.longitude
    assert ce.speed == t.speed
    # risk_level must be carried through UNCHANGED, never recomputed
    assert ce.risk_level == t.risk_level
    assert ce.confidence == t.risk_score
    assert ce.distance_m == t.object_distance
    assert ce.ttc_s == t.ttc
    assert ce.recommended_action == t.recommended_action


def test_compact_event_prototype_constants():
    t = _sample_telemetry()
    ce = to_compact_event(t)
    assert isinstance(ce.sensor_health, CompactSensorHealth)
    for sensor in ("lidar", "ultrasonic", "camera", "bh1750", "mpu6050", "gnss", "lora"):
        assert getattr(ce.sensor_health, sensor) == SensorHealthStatus.OK
    assert ce.network_status == "LORA"
    assert ce.edge_processed is True


def test_risk_type_head_on_v2v():
    t = _sample_telemetry(object_type="HEMM-02", object_detected=True)
    assert classify_risk_type(t) == "V2V_HEAD_ON"


def test_risk_type_none_when_no_object_detected():
    t = _sample_telemetry(
        object_detected=False,
        object_type=None,
        object_distance=None,
        ttc=None,
        risk_level=RiskLevel.NORMAL,
        risk_score=0.05,
    )
    assert classify_risk_type(t) == "NONE"


def test_risk_type_unknown_when_risk_level_unknown():
    t = _sample_telemetry(risk_level=RiskLevel.UNKNOWN)
    assert classify_risk_type(t) == "UNKNOWN"


def test_confidence_falls_back_to_zero_when_risk_score_missing():
    t = _sample_telemetry(risk_score=None)
    ce = to_compact_event(t)
    assert ce.confidence == 0.0


def test_adapter_does_not_mutate_source_telemetry():
    t = _sample_telemetry()
    original_level = t.risk_level
    original_score = t.risk_score
    to_compact_event(t)
    assert t.risk_level == original_level
    assert t.risk_score == original_score


if __name__ == "__main__":
    test_to_compact_event_preserves_core_fields()
    test_compact_event_prototype_constants()
    test_risk_type_head_on_v2v()
    test_risk_type_none_when_no_object_detected()
    test_risk_type_unknown_when_risk_level_unknown()
    test_confidence_falls_back_to_zero_when_risk_score_missing()
    test_adapter_does_not_mutate_source_telemetry()
    print("All compact event tests passed")
    print("(see test_sensor_health.py for Feature 2 sensor-health validation tests)")

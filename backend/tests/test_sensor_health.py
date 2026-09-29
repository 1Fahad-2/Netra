"""
Minimal tests for Sensor Health Validation (Feature 2 add-on).

Verifies:
  - CompactSensorHealth accepts all valid per-sensor statuses
    (OK, WARNING, FAILED, UNKNOWN) across every tracked sensor.
  - CompactSensorHealth rejects an invalid status value with a
    ValidationError (invalid statuses are handled safely, not silently
    accepted).
  - CompactSensorHealth rejects a payload missing a required sensor.
  - build_simulated_sensor_health() keeps the current simulated behavior
    (every sensor "OK") working.
  - to_compact_event() produces a valid, structured sensor_health map
    without touching risk_level / risk_score / thresholds.

Does NOT test the Sensor Health dashboard (not built in this feature),
real hardware detection, or Store-and-Forward — all out of scope.
"""

import pytest
from pydantic import ValidationError

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
    CompactSensorHealth,
    SensorHealthStatus,
    build_simulated_sensor_health,
    to_compact_event,
)

SENSOR_FIELDS = ("lidar", "ultrasonic", "camera", "bh1750", "mpu6050", "gnss", "lora")


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


def _all_sensors(status: SensorHealthStatus) -> dict:
    return {field: status for field in SENSOR_FIELDS}


def test_all_allowed_statuses_are_accepted_per_sensor():
    for status in (
        SensorHealthStatus.OK,
        SensorHealthStatus.WARNING,
        SensorHealthStatus.FAILED,
        SensorHealthStatus.UNKNOWN,
    ):
        health = CompactSensorHealth(**_all_sensors(status))
        for field in SENSOR_FIELDS:
            assert getattr(health, field) == status


def test_mixed_valid_statuses_across_sensors():
    health = CompactSensorHealth(
        lidar="OK",
        ultrasonic="WARNING",
        camera="FAILED",
        bh1750="UNKNOWN",
        mpu6050="OK",
        gnss="WARNING",
        lora="OK",
    )
    assert health.lidar == SensorHealthStatus.OK
    assert health.ultrasonic == SensorHealthStatus.WARNING
    assert health.camera == SensorHealthStatus.FAILED
    assert health.bh1750 == SensorHealthStatus.UNKNOWN


def test_invalid_sensor_status_is_rejected():
    payload = _all_sensors(SensorHealthStatus.OK)
    payload["lora"] = "BROKEN"  # not a valid SensorHealthStatus
    with pytest.raises(ValidationError):
        CompactSensorHealth(**payload)


def test_missing_sensor_is_rejected():
    payload = _all_sensors(SensorHealthStatus.OK)
    del payload["gnss"]
    with pytest.raises(ValidationError):
        CompactSensorHealth(**payload)


def test_build_simulated_sensor_health_is_all_ok():
    health = build_simulated_sensor_health()
    for field in SENSOR_FIELDS:
        assert getattr(health, field) == SensorHealthStatus.OK


def test_to_compact_event_produces_valid_simulated_sensor_health():
    t = _sample_telemetry()
    ce = to_compact_event(t)
    assert isinstance(ce.sensor_health, CompactSensorHealth)
    for field in SENSOR_FIELDS:
        assert getattr(ce.sensor_health, field) == SensorHealthStatus.OK
    # Feature 2 must not touch risk/safety fields.
    assert ce.risk_level == t.risk_level
    assert ce.confidence == t.risk_score


if __name__ == "__main__":
    test_all_allowed_statuses_are_accepted_per_sensor()
    test_mixed_valid_statuses_across_sensors()
    try:
        test_invalid_sensor_status_is_rejected()
        test_missing_sensor_is_rejected()
    except Exception as exc:  # pragma: no cover - direct-run fallback
        raise
    test_build_simulated_sensor_health_is_all_ok()
    test_to_compact_event_produces_valid_simulated_sensor_health()
    print("All sensor health validation tests passed")

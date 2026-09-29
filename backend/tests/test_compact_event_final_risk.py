"""
Backend Compact Event — Final Risk + Recommendation tests — Phase-7.

Verifies only the NEW Feature-7 adapter surface (attach_final_risk_recommendation /
to_compact_event_with_final_risk). It does NOT re-test:
  - to_compact_event()'s existing field mapping (test_compact_event.py)
  - RiskRecommendationIntegrationService's fusion/recommendation logic
    (test_risk_recommendation_integration_service.py)

Covers:
  - final_risk is correctly propagated from RiskRecommendationIntegrationService
  - recommended_action matches final_risk (for every risk level)
  - existing CompactEvent fields remain intact after enrichment
  - UNKNOWN is handled safely (no coords / no edge / no v2v)
"""

import pytest

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
    to_compact_event_with_final_risk,
    attach_final_risk_recommendation,
    CompactEvent,
)
from app.services.route_projector import _FROZEN_ROUTE, BC01_APEX_INDEX


def _vertex_lat_lng(index: int):
    """Same helper pattern as test_risk_integration_service.py."""
    lng, lat = _FROZEN_ROUTE[index]
    return lat, lng


# Open-corridor coordinate (route end, past BC02) → NORMAL infrastructure risk.
_NORMAL_LAT, _NORMAL_LNG = _vertex_lat_lng(len(_FROZEN_ROUTE) - 1)
# BC01 apex → HIGH infrastructure risk.
_BC01_LAT, _BC01_LNG = _vertex_lat_lng(BC01_APEX_INDEX)
# Far outside the frozen route entirely → UNKNOWN infrastructure risk.
_OFF_ROUTE_LAT, _OFF_ROUTE_LNG = 0.0, 0.0


def _sample_telemetry(**overrides) -> VehicleTelemetry:
    base = dict(
        vehicle_id="HEMM-01",
        vehicle_type="100T DUMPER (FORWARD)",
        timestamp="2026-01-01T00:00:00.000Z",
        position=Position3D(latitude=_NORMAL_LAT, longitude=_NORMAL_LNG, altitude=1040),
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


# ─────────────────────────────────────────────────────────────────────────────
# final_risk propagation + recommended_action matches final_risk
# ─────────────────────────────────────────────────────────────────────────────
@pytest.mark.parametrize(
    "lat, lng, edge_risk, v2v_risk, expected_final_risk, expected_action",
    [
        (_NORMAL_LAT, _NORMAL_LNG, RiskLevel.NORMAL, RiskLevel.NORMAL, RiskLevel.NORMAL, "PROCEED"),
        (_NORMAL_LAT, _NORMAL_LNG, RiskLevel.CAUTION, RiskLevel.NORMAL, RiskLevel.CAUTION, "MAINTAIN SAFE SPEED"),
        (_BC01_LAT, _BC01_LNG, RiskLevel.NORMAL, RiskLevel.NORMAL, RiskLevel.HIGH, "REDUCE SPEED"),
        (_NORMAL_LAT, _NORMAL_LNG, RiskLevel.CRITICAL, RiskLevel.NORMAL, RiskLevel.CRITICAL, "HOLD / STOP"),
    ],
)
def test_final_risk_and_recommendation_propagate_for_every_level(
    lat, lng, edge_risk, v2v_risk, expected_final_risk, expected_action
):
    t = _sample_telemetry(position=Position3D(latitude=lat, longitude=lng, altitude=1040))
    ce = to_compact_event_with_final_risk(t, edge_risk=edge_risk, v2v_risk=v2v_risk)

    assert isinstance(ce, CompactEvent)
    assert ce.final_risk == expected_final_risk
    assert ce.recommended_action == expected_action


# ─────────────────────────────────────────────────────────────────────────────
# UNKNOWN handled safely
# ─────────────────────────────────────────────────────────────────────────────
def test_unknown_final_risk_is_handled_safely():
    t = _sample_telemetry(position=Position3D(latitude=_OFF_ROUTE_LAT, longitude=_OFF_ROUTE_LNG, altitude=0))
    ce = to_compact_event_with_final_risk(t)  # no edge_risk / v2v_risk supplied

    assert ce.final_risk == RiskLevel.UNKNOWN
    assert ce.recommended_action == "MONITOR"


# ─────────────────────────────────────────────────────────────────────────────
# Existing CompactEvent fields remain intact after enrichment
# ─────────────────────────────────────────────────────────────────────────────
def test_existing_fields_are_untouched_by_enrichment():
    t = _sample_telemetry()
    base = to_compact_event(t)
    enriched = attach_final_risk_recommendation(base, edge_risk=RiskLevel.HIGH, v2v_risk=RiskLevel.NORMAL)

    assert enriched.vehicle_id == base.vehicle_id
    assert enriched.timestamp == base.timestamp
    assert enriched.gps == base.gps
    assert enriched.speed == base.speed
    assert enriched.risk_type == base.risk_type
    assert enriched.confidence == base.confidence
    assert enriched.distance_m == base.distance_m
    assert enriched.ttc_s == base.ttc_s
    assert enriched.sensor_health == base.sensor_health
    assert enriched.network_status == base.network_status
    assert enriched.edge_processed == base.edge_processed
    # risk_level (existing field, sourced from telemetry) is also untouched.
    assert enriched.risk_level == base.risk_level
    # final_risk / recommended_action are the only fields Feature 7 sets.
    assert enriched.final_risk == RiskLevel.HIGH
    assert enriched.recommended_action == "REDUCE SPEED"


def test_attach_does_not_mutate_the_input_event():
    t = _sample_telemetry()
    base = to_compact_event(t)
    original_recommended_action = base.recommended_action
    original_final_risk = base.final_risk

    attach_final_risk_recommendation(base, edge_risk=RiskLevel.CRITICAL, v2v_risk=RiskLevel.NORMAL)

    assert base.recommended_action == original_recommended_action
    assert base.final_risk == original_final_risk


def test_existing_to_compact_event_unaffected_by_feature_7():
    """to_compact_event() itself must keep behaving exactly as before Feature 7."""
    t = _sample_telemetry()
    ce = to_compact_event(t)
    assert ce.final_risk is None
    assert ce.recommended_action == t.recommended_action
    assert ce.risk_level == t.risk_level

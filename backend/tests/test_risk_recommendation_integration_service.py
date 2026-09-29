"""
Backend Risk + Recommendation Integration Service tests — Phase-6.

Verifies the RiskIntegrationService → RecommendationService wiring only.
Neither existing service's internal logic is re-tested here (that's
already covered by test_risk_integration_service.py and
test_recommendation_service.py).

Covers:
  - final_risk / edge_risk / v2v_risk / infrastructure_risk /
    contributing_sources are passed through unchanged from
    RiskIntegrationService
  - recommended_action is correctly derived for every RiskLevel reachable
    via the integration (NORMAL, CAUTION, HIGH, CRITICAL, UNKNOWN)
  - repeated calls with the same input are deterministic
"""

import pytest

from app.services.risk_recommendation_integration_service import (
    RiskRecommendationIntegrationService,
    RiskRecommendationResult,
)
from app.services.route_projector import _FROZEN_ROUTE, BC01_APEX_INDEX
from app.schemas.telemetry import RiskLevel


def _vertex_lat_lng(index: int):
    """Same helper pattern as test_risk_integration_service.py."""
    lng, lat = _FROZEN_ROUTE[index]
    return lat, lng


@pytest.fixture
def service() -> RiskRecommendationIntegrationService:
    return RiskRecommendationIntegrationService()


# Open-corridor coordinate (route end, past BC02) → NORMAL infrastructure risk.
_NORMAL_LOCATION = _vertex_lat_lng(len(_FROZEN_ROUTE) - 1)
# BC01 apex → HIGH infrastructure risk.
_BC01_LOCATION = _vertex_lat_lng(BC01_APEX_INDEX)
# Far outside the frozen route entirely → UNKNOWN infrastructure risk.
_OFF_ROUTE_LOCATION = (0.0, 0.0)


# ─────────────────────────────────────────────────────────────────────────────
# Every risk level maps to its required recommended_action
# ─────────────────────────────────────────────────────────────────────────────
def test_normal_final_risk_recommends_proceed(service):
    lat, lng = _NORMAL_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert isinstance(result, RiskRecommendationResult)
    assert result.final_risk == RiskLevel.NORMAL
    assert result.recommended_action == "PROCEED"


def test_caution_final_risk_recommends_maintain_safe_speed(service):
    lat, lng = _NORMAL_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.CAUTION, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.CAUTION
    assert result.recommended_action == "MAINTAIN SAFE SPEED"


def test_high_final_risk_recommends_reduce_speed(service):
    lat, lng = _BC01_LOCATION  # infrastructure risk is HIGH here
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.HIGH
    assert result.recommended_action == "REDUCE SPEED"


def test_critical_final_risk_recommends_hold_stop(service):
    lat, lng = _NORMAL_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.CRITICAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.CRITICAL
    assert result.recommended_action == "HOLD / STOP"


def test_unknown_final_risk_recommends_monitor(service):
    result = service.assess(latitude=None, longitude=None)
    assert result.final_risk == RiskLevel.UNKNOWN
    assert result.recommended_action == "MONITOR"


# ─────────────────────────────────────────────────────────────────────────────
# Signals are passed through unchanged from RiskIntegrationService
# ─────────────────────────────────────────────────────────────────────────────
def test_all_signals_and_sources_pass_through_unchanged(service):
    lat, lng = _BC01_LOCATION  # infrastructure risk is HIGH here
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.HIGH, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.edge_risk == RiskLevel.HIGH
    assert result.v2v_risk == RiskLevel.NORMAL
    assert result.infrastructure_risk == RiskLevel.HIGH
    assert set(result.contributing_sources) == {"edge", "infrastructure"}
    assert result.final_risk == RiskLevel.HIGH
    assert result.recommended_action == "REDUCE SPEED"


def test_off_route_infrastructure_ignored_when_others_valid(service):
    lat, lng = _OFF_ROUTE_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.CAUTION, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.infrastructure_risk == RiskLevel.UNKNOWN
    assert result.final_risk == RiskLevel.CAUTION
    assert result.recommended_action == "MAINTAIN SAFE SPEED"


# ─────────────────────────────────────────────────────────────────────────────
# Determinism
# ─────────────────────────────────────────────────────────────────────────────
def test_repeated_calls_are_deterministic(service):
    lat, lng = _BC01_LOCATION
    first = service.assess(latitude=lat, longitude=lng, edge_risk=RiskLevel.HIGH, v2v_risk=RiskLevel.NORMAL)
    second = service.assess(latitude=lat, longitude=lng, edge_risk=RiskLevel.HIGH, v2v_risk=RiskLevel.NORMAL)
    assert first == second

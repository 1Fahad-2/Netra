"""
Backend Risk Integration Service tests — Phase-4C.

Verifies the InfrastructureRiskService → RiskFusionService wiring only.
Neither existing service's internal logic is re-tested here (that's already
covered by test_infrastructure_risk_service.py and test_risk_fusion_service.py).

Covers:
  - normal infrastructure + normal other risks
  - HIGH infrastructure + normal other risks
  - infrastructure UNKNOWN (off-route / missing coords) handled safely
  - CRITICAL edge/V2V risk survives fusion regardless of infrastructure risk
  - contributing_sources correctly reflects which signal(s) drove final_risk
"""

import pytest

from app.services.risk_integration_service import (
    RiskIntegrationService,
    RiskIntegrationResult,
)
from app.services.route_projector import _FROZEN_ROUTE, BC01_APEX_INDEX
from app.schemas.telemetry import RiskLevel


def _vertex_lat_lng(index: int):
    """Same helper pattern as test_route_projector.py / test_infrastructure_risk_service.py."""
    lng, lat = _FROZEN_ROUTE[index]
    return lat, lng


@pytest.fixture
def service() -> RiskIntegrationService:
    return RiskIntegrationService()


# Open-corridor coordinate (route end, past BC02) → NORMAL infrastructure risk.
_NORMAL_LOCATION = _vertex_lat_lng(len(_FROZEN_ROUTE) - 1)
# BC01 apex → HIGH infrastructure risk.
_BC01_LOCATION = _vertex_lat_lng(BC01_APEX_INDEX)
# Far outside the frozen route entirely → UNKNOWN infrastructure risk.
_OFF_ROUTE_LOCATION = (0.0, 0.0)


# ─────────────────────────────────────────────────────────────────────────────
# Normal infrastructure + normal other risks
# ─────────────────────────────────────────────────────────────────────────────
def test_normal_infrastructure_and_normal_others_fuse_to_normal(service):
    lat, lng = _NORMAL_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert isinstance(result, RiskIntegrationResult)
    assert result.infrastructure_risk == RiskLevel.NORMAL
    assert result.edge_risk == RiskLevel.NORMAL
    assert result.v2v_risk == RiskLevel.NORMAL
    assert result.final_risk == RiskLevel.NORMAL


# ─────────────────────────────────────────────────────────────────────────────
# HIGH infrastructure + normal other risks
# ─────────────────────────────────────────────────────────────────────────────
def test_high_infrastructure_elevates_final_risk(service):
    lat, lng = _BC01_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.infrastructure_risk == RiskLevel.HIGH
    assert result.final_risk == RiskLevel.HIGH
    assert result.contributing_sources == ["infrastructure"]


# ─────────────────────────────────────────────────────────────────────────────
# Infrastructure UNKNOWN handled safely
# ─────────────────────────────────────────────────────────────────────────────
def test_unknown_infrastructure_is_ignored_when_others_valid(service):
    lat, lng = _OFF_ROUTE_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.CAUTION, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.infrastructure_risk == RiskLevel.UNKNOWN
    assert result.final_risk == RiskLevel.CAUTION
    assert result.contributing_sources == ["edge"]


def test_all_unknown_or_normal_inputs_with_missing_coords(service):
    # No lat/lng at all → infrastructure UNKNOWN; no edge/v2v provided → also UNKNOWN.
    result = service.assess(latitude=None, longitude=None)
    assert result.infrastructure_risk == RiskLevel.UNKNOWN
    assert result.edge_risk == RiskLevel.UNKNOWN
    assert result.v2v_risk == RiskLevel.UNKNOWN
    assert result.final_risk == RiskLevel.UNKNOWN
    assert result.contributing_sources == []


# ─────────────────────────────────────────────────────────────────────────────
# CRITICAL edge/V2V risk survives fusion
# ─────────────────────────────────────────────────────────────────────────────
def test_critical_edge_risk_survives_regardless_of_infrastructure(service):
    lat, lng = _NORMAL_LOCATION
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.CRITICAL, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.CRITICAL
    assert result.contributing_sources == ["edge"]


def test_critical_v2v_risk_survives_even_with_high_infrastructure(service):
    lat, lng = _BC01_LOCATION  # infrastructure risk is HIGH here
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.CRITICAL,
    )
    assert result.infrastructure_risk == RiskLevel.HIGH
    assert result.final_risk == RiskLevel.CRITICAL
    assert result.contributing_sources == ["v2v"]


# ─────────────────────────────────────────────────────────────────────────────
# contributing_sources
# ─────────────────────────────────────────────────────────────────────────────
def test_contributing_sources_includes_all_tied_signals(service):
    lat, lng = _BC01_LOCATION  # infrastructure risk is HIGH here
    result = service.assess(
        latitude=lat, longitude=lng,
        edge_risk=RiskLevel.HIGH, v2v_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.HIGH
    assert set(result.contributing_sources) == {"edge", "infrastructure"}

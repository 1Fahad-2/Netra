"""
Backend Infrastructure Risk Service tests — Phase-4B.

Verifies:
  - NORMAL when outside a hazard zone (open corridor, e.g. past BC02)
  - BC01 blind-curve zone classified with elevated risk (HIGH), correct zone_id
  - BC02 blind-curve zone classified with elevated risk (HIGH), correct zone_id
  - UNKNOWN when location/context cannot be determined (missing coords or
    off-route)
  - Deterministic output for repeated/reordered calls

Uses the same known-vertex lookup approach as tests/test_route_projector.py
so the fixtures stay in sync with the frozen route automatically.
"""

import pytest

from app.services.infrastructure_risk_service import (
    InfrastructureRiskService,
    InfrastructureRiskResult,
    BLIND_CURVE_TYPE,
    OPEN_ROAD_TYPE,
    UNKNOWN_TYPE,
)
from app.services.route_projector import (
    _FROZEN_ROUTE,
    BC01_APEX_INDEX,
    BC02_APEX_INDEX,
)
from app.schemas.telemetry import RiskLevel


def _vertex_lat_lng(index: int):
    """Return (latitude, longitude) for the given frozen route vertex."""
    lng, lat = _FROZEN_ROUTE[index]
    return lat, lng


@pytest.fixture
def service() -> InfrastructureRiskService:
    return InfrastructureRiskService()


# ─────────────────────────────────────────────────────────────────────────────
# NORMAL — outside any hazard zone
# ─────────────────────────────────────────────────────────────────────────────
def test_open_corridor_past_bc02_is_normal(service):
    # Route-end vertex (62) is in the BC02_EXIT section — open corridor.
    lat, lng = _vertex_lat_lng(len(_FROZEN_ROUTE) - 1)
    result = service.assess(latitude=lat, longitude=lng)
    assert result.risk_level == RiskLevel.NORMAL
    assert result.risk_type == OPEN_ROAD_TYPE
    assert result.zone_id is None


# ─────────────────────────────────────────────────────────────────────────────
# BC01
# ─────────────────────────────────────────────────────────────────────────────
def test_bc01_apex_is_elevated_risk(service):
    lat, lng = _vertex_lat_lng(BC01_APEX_INDEX)
    result = service.assess(latitude=lat, longitude=lng)
    assert result.risk_level == RiskLevel.HIGH
    assert result.risk_type == BLIND_CURVE_TYPE
    assert result.zone_id == "BC01"
    assert "BC01" in result.reason


# ─────────────────────────────────────────────────────────────────────────────
# BC02
# ─────────────────────────────────────────────────────────────────────────────
def test_bc02_apex_is_elevated_risk(service):
    lat, lng = _vertex_lat_lng(BC02_APEX_INDEX)
    result = service.assess(latitude=lat, longitude=lng)
    assert result.risk_level == RiskLevel.HIGH
    assert result.risk_type == BLIND_CURVE_TYPE
    assert result.zone_id == "BC02"
    assert "BC02" in result.reason


def test_bc01_and_bc02_are_distinct_zones(service):
    bc01 = service.assess(*_vertex_lat_lng(BC01_APEX_INDEX))
    bc02 = service.assess(*_vertex_lat_lng(BC02_APEX_INDEX))
    assert bc01.zone_id != bc02.zone_id


# ─────────────────────────────────────────────────────────────────────────────
# UNKNOWN — location/context cannot be determined
# ─────────────────────────────────────────────────────────────────────────────
def test_missing_coordinates_are_unknown(service):
    result = service.assess(latitude=None, longitude=None)
    assert result.risk_level == RiskLevel.UNKNOWN
    assert result.risk_type == UNKNOWN_TYPE
    assert result.zone_id is None


def test_off_route_coordinate_is_unknown(service):
    # Far away from the mine corridor entirely.
    result = service.assess(latitude=0.0, longitude=0.0)
    assert result.risk_level == RiskLevel.UNKNOWN
    assert result.risk_type == UNKNOWN_TYPE
    assert result.zone_id is None


# ─────────────────────────────────────────────────────────────────────────────
# Determinism
# ─────────────────────────────────────────────────────────────────────────────
def test_assessment_is_deterministic_across_repeated_calls(service):
    lat, lng = _vertex_lat_lng(BC01_APEX_INDEX)
    results = [service.assess(latitude=lat, longitude=lng) for _ in range(5)]
    for result in results:
        assert result.risk_level == RiskLevel.HIGH
        assert result.zone_id == "BC01"


def test_assessment_deterministic_regardless_of_service_instance(service):
    other = InfrastructureRiskService()
    lat, lng = _vertex_lat_lng(BC02_APEX_INDEX)
    r1 = service.assess(latitude=lat, longitude=lng)
    r2 = other.assess(latitude=lat, longitude=lng)
    assert r1.risk_level == r2.risk_level
    assert r1.risk_type == r2.risk_type
    assert r1.zone_id == r2.zone_id


def test_result_is_infrastructure_risk_result(service):
    result = service.assess(latitude=0.0, longitude=0.0)
    assert isinstance(result, InfrastructureRiskResult)

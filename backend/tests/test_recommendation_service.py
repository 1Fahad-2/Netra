"""
Backend Recommendation Service tests — Phase-5.

Verifies the RiskLevel → recommended_action mapping only. No risk
calculation is exercised or re-tested here.

Covers:
  - every RiskLevel maps to its required recommended_action
  - risk_level is passed through unchanged in the result
  - repeated calls with the same input are deterministic (same output)
"""

import pytest

from app.services.recommendation_service import (
    RecommendationService,
    RecommendationResult,
)
from app.schemas.telemetry import RiskLevel


@pytest.fixture
def service() -> RecommendationService:
    return RecommendationService()


@pytest.mark.parametrize(
    "final_risk, expected_action",
    [
        (RiskLevel.NORMAL, "PROCEED"),
        (RiskLevel.CAUTION, "MAINTAIN SAFE SPEED"),
        (RiskLevel.HIGH, "REDUCE SPEED"),
        (RiskLevel.CRITICAL, "HOLD / STOP"),
        (RiskLevel.UNKNOWN, "MONITOR"),
    ],
)
def test_maps_every_risk_level_to_required_action(service, final_risk, expected_action):
    result = service.recommend(final_risk)

    assert isinstance(result, RecommendationResult)
    assert result.recommended_action == expected_action
    assert result.risk_level == final_risk


@pytest.mark.parametrize("final_risk", list(RiskLevel))
def test_repeated_calls_are_deterministic(service, final_risk):
    first = service.recommend(final_risk)
    second = service.recommend(final_risk)
    third = service.recommend(final_risk)

    assert first == second == third


def test_all_risk_levels_are_covered():
    """Guards against a future RiskLevel value silently falling through."""
    from app.services.recommendation_service import _RECOMMENDATION_MAP

    assert set(_RECOMMENDATION_MAP.keys()) == set(RiskLevel)

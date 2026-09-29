"""
MachineMind — Recommendation Engine (Phase-5)

Small, reusable service that turns an already-computed final risk level
into an operator-facing recommendation. This module contains NO risk
calculation of its own — it only maps an existing `RiskLevel` value
(e.g. the `final_risk` produced by RiskIntegrationService /
RiskFusionService) to a fixed, deterministic recommended action.

RiskFusionService, InfrastructureRiskService, V2V/Edge logic, and the
Compact Event schema are all untouched by this feature.
"""

from dataclasses import dataclass

from app.schemas.telemetry import RiskLevel

# Deterministic, fixed mapping from risk level to operator recommendation.
# Intentionally a plain string (not a shared enum) so this feature does not
# touch the existing RecommendedAction enum used by V2V/Edge/CompactEvent.
_RECOMMENDATION_MAP: dict[RiskLevel, str] = {
    RiskLevel.NORMAL: "PROCEED",
    RiskLevel.CAUTION: "MAINTAIN SAFE SPEED",
    RiskLevel.HIGH: "REDUCE SPEED",
    RiskLevel.CRITICAL: "HOLD / STOP",
    RiskLevel.UNKNOWN: "MONITOR",
}


@dataclass
class RecommendationResult:
    """Recommended operator action plus the risk level it was derived from."""

    recommended_action: str
    risk_level: RiskLevel


class RecommendationService:
    """Maps a final risk level to a recommended action.

    Stateless — safe to use as a module-level singleton (see
    `recommendation_service` below) or instantiated per-call.
    """

    def recommend(self, final_risk: RiskLevel) -> RecommendationResult:
        """Return the deterministic recommendation for `final_risk`.

        Any value not present in the mapping (should not normally occur,
        since `RiskLevel` is exhaustive) safely falls back to "MONITOR",
        matching the UNKNOWN behavior.
        """
        recommended_action = _RECOMMENDATION_MAP.get(final_risk, _RECOMMENDATION_MAP[RiskLevel.UNKNOWN])
        return RecommendationResult(
            recommended_action=recommended_action,
            risk_level=final_risk,
        )


# Module-level singleton, following the pattern used by the other services.
recommendation_service = RecommendationService()

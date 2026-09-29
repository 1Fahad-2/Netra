"""
MachineMind — Risk + Recommendation Integration (Phase-6)

Small glue service that wires the existing RiskIntegrationService (which
itself already wires InfrastructureRiskService → RiskFusionService) into
the existing RecommendationService, so a caller can go from a GPS
coordinate plus edge/V2V risk readings straight to one final fused risk
AND its recommended operator action.

This module contains NO risk calculation, NO fusion logic, and NO
recommendation-mapping logic of its own — it only calls the two existing
services and reshapes their results into one response. Neither existing
service is modified.
"""

from dataclasses import dataclass
from typing import List, Optional

from app.schemas.telemetry import RiskLevel
from app.services.risk_integration_service import (
    RiskIntegrationService,
    risk_integration_service,
)
from app.services.recommendation_service import (
    RecommendationService,
    recommendation_service,
)


@dataclass
class RiskRecommendationResult:
    """Final fused risk, every contributing signal, and the recommended action."""

    final_risk: RiskLevel
    edge_risk: RiskLevel
    v2v_risk: RiskLevel
    infrastructure_risk: RiskLevel
    contributing_sources: List[str]
    recommended_action: str


class RiskRecommendationIntegrationService:
    """Connects RiskIntegrationService's final_risk into RecommendationService.

    Stateless — safe to use as a module-level singleton (see
    `risk_recommendation_integration_service` below) or instantiated
    per-call. Holds references to the two existing services rather than
    re-implementing anything they already do.
    """

    def __init__(
        self,
        integration_service: RiskIntegrationService = risk_integration_service,
        recommendation_svc: RecommendationService = recommendation_service,
    ) -> None:
        self._integration_service = integration_service
        self._recommendation_service = recommendation_svc

    def assess(
        self,
        latitude: Optional[float],
        longitude: Optional[float],
        edge_risk: Optional[RiskLevel] = None,
        v2v_risk: Optional[RiskLevel] = None,
    ) -> RiskRecommendationResult:
        """Fuse edge/V2V/infrastructure risk, then recommend an action for it.

        - final_risk / edge_risk / v2v_risk / infrastructure_risk /
          contributing_sources are taken as-is from the existing
          RiskIntegrationService.assess() — unchanged.
        - recommended_action is derived from that final_risk via the
          existing RecommendationService.recommend() — unchanged.
        """
        integration_result = self._integration_service.assess(
            latitude=latitude,
            longitude=longitude,
            edge_risk=edge_risk,
            v2v_risk=v2v_risk,
        )

        recommendation_result = self._recommendation_service.recommend(
            integration_result.final_risk
        )

        return RiskRecommendationResult(
            final_risk=integration_result.final_risk,
            edge_risk=integration_result.edge_risk,
            v2v_risk=integration_result.v2v_risk,
            infrastructure_risk=integration_result.infrastructure_risk,
            contributing_sources=integration_result.contributing_sources,
            recommended_action=recommendation_result.recommended_action,
        )


# Module-level singleton, matching the pattern used by the services it wires together.
risk_recommendation_integration_service = RiskRecommendationIntegrationService()

"""
MachineMind — Infrastructure Risk → Risk Fusion Integration (Phase-4C)

Small glue service that wires the existing InfrastructureRiskService into
the existing RiskFusionService, so a caller can go from a GPS coordinate
plus the existing edge/V2V risk readings straight to one final fused risk.

This module contains NO fusion logic and NO infrastructure-zone logic of
its own — it only calls the two existing services and reshapes their
results into one response. Neither existing service is modified.
"""

from dataclasses import dataclass
from typing import List, Optional

from app.schemas.telemetry import RiskLevel
from app.services.infrastructure_risk_service import (
    InfrastructureRiskService,
    infrastructure_risk_service,
)
from app.services.risk_fusion_service import (
    RiskFusionService,
    risk_fusion_service,
)


@dataclass
class RiskIntegrationResult:
    """Final fused risk plus every contributing signal, for a vehicle/location."""

    final_risk: RiskLevel
    edge_risk: RiskLevel
    v2v_risk: RiskLevel
    infrastructure_risk: RiskLevel
    contributing_sources: List[str]


class RiskIntegrationService:
    """Connects InfrastructureRiskService's output into RiskFusionService.

    Stateless — safe to use as a module-level singleton (see
    `risk_integration_service` below) or instantiated per-call. Holds
    references to the two existing services rather than re-implementing
    anything they already do.
    """

    def __init__(
        self,
        infra_service: InfrastructureRiskService = infrastructure_risk_service,
        fusion_service: RiskFusionService = risk_fusion_service,
    ) -> None:
        self._infra_service = infra_service
        self._fusion_service = fusion_service

    def assess(
        self,
        latitude: Optional[float],
        longitude: Optional[float],
        edge_risk: Optional[RiskLevel] = None,
        v2v_risk: Optional[RiskLevel] = None,
    ) -> RiskIntegrationResult:
        """Fuse edge risk, V2V risk, and location-derived infrastructure risk.

        - edge_risk / v2v_risk are passed through unchanged (preserved as-is)
          to RiskFusionService, exactly as Feature 4A already handles them.
        - infrastructure_risk is derived from (latitude, longitude) via the
          existing InfrastructureRiskService.assess(), including its
          existing UNKNOWN handling for missing/off-route coordinates —
          RiskFusionService already treats UNKNOWN as "no valid reading"
          and safely ignores it during fusion.
        """
        infra_result = self._infra_service.assess(latitude=latitude, longitude=longitude)

        fusion_result = self._fusion_service.fuse(
            edge_risk=edge_risk,
            v2v_risk=v2v_risk,
            infrastructure_risk=infra_result.risk_level,
        )

        return RiskIntegrationResult(
            final_risk=fusion_result.final_risk,
            edge_risk=fusion_result.sources["edge"],
            v2v_risk=fusion_result.sources["v2v"],
            infrastructure_risk=fusion_result.sources["infrastructure"],
            contributing_sources=fusion_result.contributing_sources,
        )


# Module-level singleton, matching the pattern used by the services it wires together.
risk_integration_service = RiskIntegrationService()

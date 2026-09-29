"""
MachineMind — Risk Fusion Service (Phase-4A)

Combines the existing independent risk signals — edge risk, V2V risk, and
infrastructure risk — into a single final risk level for a vehicle/route
segment.

This service performs *fusion only*. It does not compute any of the input
risks itself:
  - edge risk            → produced elsewhere (on-vehicle / edge inference)
  - V2V risk              → produced by app.services.v2v_engine
  - infrastructure risk   → not implemented yet (Phase-4B+); callers may
                              omit it or pass RiskLevel.UNKNOWN until then

Fusion rule (deterministic, "worst signal wins"):
  The final risk is the highest-severity risk level among all *valid*
  (non-UNKNOWN, non-missing) inputs. RiskLevel.UNKNOWN / a missing input is
  never treated as more severe than a valid reading, and never suppresses a
  valid reading from another source. If every input is missing/UNKNOWN, the
  final risk is UNKNOWN — there is simply no information to fuse.

  Severity order (low → high): NORMAL < CAUTION < HIGH < CRITICAL

This guarantees requirement #3: the final risk is never lower than the
highest valid incoming risk.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from app.schemas.telemetry import RiskLevel

# ── Risk sources fused by this service ──────────────────────────────────────
EDGE_SOURCE = "edge"
V2V_SOURCE = "v2v"
INFRASTRUCTURE_SOURCE = "infrastructure"

# ── Severity ordering used for fusion (higher = more severe) ────────────────
# RiskLevel.UNKNOWN is intentionally excluded: it is not a severity level,
# it means "no valid reading", so it never participates in the max().
_SEVERITY_ORDER: Dict[RiskLevel, int] = {
    RiskLevel.NORMAL: 0,
    RiskLevel.CAUTION: 1,
    RiskLevel.HIGH: 2,
    RiskLevel.CRITICAL: 3,
}


@dataclass
class RiskFusionResult:
    """Result of fusing the three risk signals.

    Attributes:
        final_risk: The fused, final risk level.
        sources: Every input source normalized to a RiskLevel (missing/None
            inputs are normalized to RiskLevel.UNKNOWN). Always contains all
            three keys: "edge", "v2v", "infrastructure".
        contributing_sources: The names of the source(s) whose risk level
            equals final_risk — i.e. the source(s) that drove the fused
            result. Empty when final_risk is UNKNOWN (no valid source).
    """

    final_risk: RiskLevel
    sources: Dict[str, RiskLevel] = field(default_factory=dict)
    contributing_sources: List[str] = field(default_factory=list)


class RiskFusionService:
    """Reusable, stateless service that fuses risk signals into one level.

    Safe to use as a module-level singleton (see `risk_fusion_service` below)
    or instantiated per-call — it holds no mutable state.
    """

    @staticmethod
    def _normalize(risk: Optional[RiskLevel]) -> RiskLevel:
        """Treat a missing (None) input the same as an explicit UNKNOWN."""
        if risk is None:
            return RiskLevel.UNKNOWN
        return risk

    def fuse(
        self,
        edge_risk: Optional[RiskLevel] = None,
        v2v_risk: Optional[RiskLevel] = None,
        infrastructure_risk: Optional[RiskLevel] = None,
    ) -> RiskFusionResult:
        """Fuse the three risk signals into one final risk level.

        Any input may be omitted or passed as RiskLevel.UNKNOWN — this is the
        expected/safe way to represent a signal that isn't available yet
        (e.g. infrastructure risk, which has no detector as of Phase-4A).

        Deterministic: the same set of inputs always produces the same
        output, regardless of call order or repetition.
        """
        sources: Dict[str, RiskLevel] = {
            EDGE_SOURCE: self._normalize(edge_risk),
            V2V_SOURCE: self._normalize(v2v_risk),
            INFRASTRUCTURE_SOURCE: self._normalize(infrastructure_risk),
        }

        valid_levels = {
            name: level
            for name, level in sources.items()
            if level in _SEVERITY_ORDER  # excludes UNKNOWN
        }

        if not valid_levels:
            # No valid input from any source — nothing to fuse.
            return RiskFusionResult(
                final_risk=RiskLevel.UNKNOWN,
                sources=sources,
                contributing_sources=[],
            )

        max_severity = max(_SEVERITY_ORDER[level] for level in valid_levels.values())
        final_risk = next(
            level for level in RiskLevel
            if level in _SEVERITY_ORDER and _SEVERITY_ORDER[level] == max_severity
        )

        # Preserve stable, deterministic source ordering (edge, v2v, infra).
        contributing_sources = [
            name
            for name in (EDGE_SOURCE, V2V_SOURCE, INFRASTRUCTURE_SOURCE)
            if _SEVERITY_ORDER.get(sources[name]) == max_severity
        ]

        return RiskFusionResult(
            final_risk=final_risk,
            sources=sources,
            contributing_sources=contributing_sources,
        )


# Module-level singleton, matching the pattern used by v2v_engine.
risk_fusion_service = RiskFusionService()

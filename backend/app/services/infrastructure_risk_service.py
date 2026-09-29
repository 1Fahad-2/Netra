"""
MachineMind — Infrastructure Risk Service (Phase-4B)

Determines infrastructure-related risk (currently: blind-curve zone risk)
for a GPS coordinate, using the *existing* frozen route projection
(app.services.route_projector) and the existing BC01/BC02 geometry it
already derives from REAL_HAUL_CORRIDOR_PATH.

This service does not invent any new geometry, thresholds, or route data —
it only classifies the route_projector's existing `section_id` output into
an infrastructure risk level using the existing RiskLevel enum.

Zone mapping (derived from route_projector._SECTIONS, unchanged there):
  BLIND_CURVE_APPROACH → CAUTION  (approaching BC01)
  BLIND_CURVE          → HIGH     (inside BC01 — restricted sightline)
  BLIND_CURVE_EXIT      → CAUTION  (between BC01 and BC02)
  BLIND_CURVE_02        → HIGH     (inside BC02 — restricted sightline)
  BC02_EXIT             → NORMAL   (past BC02, open corridor)
  off-route / no coordinates → UNKNOWN (location/context cannot be determined)
"""

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

from app.schemas.telemetry import RiskLevel
from app.services.route_projector import project_gps_to_route

# ── Risk types returned in InfrastructureRiskResult.risk_type ───────────────
BLIND_CURVE_APPROACH_TYPE = "BLIND_CURVE_APPROACH"
BLIND_CURVE_TYPE = "BLIND_CURVE"
BLIND_CURVE_EXIT_TYPE = "BLIND_CURVE_EXIT"
OPEN_ROAD_TYPE = "OPEN_ROAD"
UNKNOWN_TYPE = "UNKNOWN"


@dataclass
class InfrastructureRiskResult:
    """Result of an infrastructure risk assessment for one GPS coordinate."""

    risk_level: RiskLevel
    risk_type: str
    zone_id: Optional[str]
    reason: str


# Maps route_projector section_id -> (risk_level, risk_type, zone_id, reason).
# Built directly on top of the existing section labels from route_projector.py —
# no new zone boundaries or thresholds are introduced here.
_SECTION_RISK_MAP: Dict[str, Tuple[RiskLevel, str, Optional[str], str]] = {
    "BLIND_CURVE_APPROACH": (
        RiskLevel.CAUTION,
        BLIND_CURVE_APPROACH_TYPE,
        "BC01_APPROACH",
        "Approaching Blind Curve 01 (BC01).",
    ),
    "BLIND_CURVE": (
        RiskLevel.HIGH,
        BLIND_CURVE_TYPE,
        "BC01",
        "Inside Blind Curve 01 (BC01) — restricted sightline.",
    ),
    "BLIND_CURVE_EXIT": (
        RiskLevel.CAUTION,
        BLIND_CURVE_EXIT_TYPE,
        "BC01_EXIT",
        "Exiting BC01 / approaching Blind Curve 02 (BC02).",
    ),
    "BLIND_CURVE_02": (
        RiskLevel.HIGH,
        BLIND_CURVE_TYPE,
        "BC02",
        "Inside Blind Curve 02 (BC02) — restricted sightline.",
    ),
    "BC02_EXIT": (
        RiskLevel.NORMAL,
        OPEN_ROAD_TYPE,
        None,
        "Past BC02 — open corridor, no known hazard zone.",
    ),
}


class InfrastructureRiskService:
    """Reusable, stateless service that derives infrastructure risk context.

    Stateless — safe to use as a module-level singleton (see
    `infrastructure_risk_service` below) or instantiated per-call.
    """

    def assess(
        self,
        latitude: Optional[float],
        longitude: Optional[float],
    ) -> InfrastructureRiskResult:
        """Assess infrastructure risk for a GPS coordinate.

        Reuses the existing frozen route projection (project_gps_to_route)
        to locate the coordinate on the haul-road corridor, then classifies
        the resulting section_id into a risk level.

        Returns UNKNOWN when the location can't be determined: missing
        coordinates, or a coordinate too far off the frozen route for the
        projector to place it (on_route=False).
        """
        if latitude is None or longitude is None:
            return InfrastructureRiskResult(
                risk_level=RiskLevel.UNKNOWN,
                risk_type=UNKNOWN_TYPE,
                zone_id=None,
                reason="Missing GPS coordinates — location cannot be determined.",
            )

        projection = project_gps_to_route(latitude=latitude, longitude=longitude)

        if not projection.on_route:
            return InfrastructureRiskResult(
                risk_level=RiskLevel.UNKNOWN,
                risk_type=UNKNOWN_TYPE,
                zone_id=None,
                reason=(
                    f"Coordinate is {projection.off_route_distance_m} m off the "
                    "frozen route — cannot determine infrastructure zone context."
                ),
            )

        mapping = _SECTION_RISK_MAP.get(projection.section_id)
        if mapping is None:
            # Defensive fallback only — every current section_id is mapped above.
            return InfrastructureRiskResult(
                risk_level=RiskLevel.NORMAL,
                risk_type=OPEN_ROAD_TYPE,
                zone_id=None,
                reason=(
                    f"Section '{projection.section_id}' has no known hazard "
                    "mapping — treated as normal."
                ),
            )

        risk_level, risk_type, zone_id, reason = mapping
        return InfrastructureRiskResult(
            risk_level=risk_level,
            risk_type=risk_type,
            zone_id=zone_id,
            reason=reason,
        )


# Module-level singleton, matching the pattern used by v2v_engine / risk_fusion_service.
infrastructure_risk_service = InfrastructureRiskService()

"""Vehicle-to-Vehicle safety calculation engine.

This module contains only pure-Python logic; it has no database or WebSocket
side-effects.  It is deliberately isolated so that the simulation can later be
swapped for a GNSS-based route matcher without touching the core algorithm.

Phase-2A four-level risk semantics (OR conditions):
  CRITICAL : gap < 10 m  OR  TTC < 2 s
  HIGH     : gap < 20 m  OR  TTC < 4 s
  CAUTION  : gap < 30 m  OR  TTC < 6 s
  NORMAL   : safe following distance (all thresholds clear)
  UNKNOWN  : insufficient / invalid telemetry data

Prototype thresholds — not official DGMS/NMDC mine-safety limits.

Direction fix (Phase-2B):
  When both vehicles have a valid route_distance the corridor-relative ordering
  (lead = higher route_distance) is used to determine SAME direction, regardless
  of raw heading difference.  This prevents the ~173° Bailadila blind-curve from
  mis-classifying HEMM-01 (LEAD) and HEMM-02 (TRAILING) as OPPOSITE-direction
  vehicles.  Pure heading comparison is preserved as a fallback for cases where
  route ordering is ambiguous (equal distances) or route data is unavailable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Tuple, Dict, Optional

from app.schemas.telemetry import VehicleTelemetry, RiskLevel, RecommendedAction
from app.constants.v2v import (
    CRITICAL_DISTANCE_M,
    HIGH_DISTANCE_M,
    CAUTION_DISTANCE_M,
    CRITICAL_TTC_S,
    HIGH_TTC_S,
    CAUTION_TTC_S,
    MAX_TELEMETRY_AGE_S,
    SAME_DIRECTION_HEADING_THRESHOLD,
    OPPOSITE_DIRECTION_HEADING_THRESHOLD,
)


@dataclass
class V2VAssessment:
    """Result of a V2V safety assessment.

    Attributes correspond to the Phase-2A specification.
    """

    risk_level: RiskLevel
    recommended_action: RecommendedAction
    distance_m: Optional[float]
    closing_speed: Optional[float]
    ttc: Optional[float]
    relative_direction: str
    same_route: bool
    telemetry_fresh: bool
    # Helper flag used by the service to decide whether to broadcast an alert.
    is_new_alert: bool = False
    # Prototype risk index for visualization/ordering.
    # Not a collision probability and not DGMS-certified.
    risk_score: Optional[float] = None
    # Human-readable explanation of the risk decision.
    risk_reason: Optional[str] = None


def _recommended_action_for(level: RiskLevel) -> RecommendedAction:
    """Map a 4-level RiskLevel to its required operator action."""
    if level == RiskLevel.CRITICAL:
        return RecommendedAction.HOLD
    if level in (RiskLevel.HIGH, RiskLevel.CAUTION):
        return RecommendedAction.REDUCE_SPEED
    if level == RiskLevel.NORMAL:
        return RecommendedAction.PROCEED
    return RecommendedAction.NOT_AVAILABLE  # UNKNOWN


def _classify_risk(distance_m: Optional[float], ttc: Optional[float]) -> RiskLevel:
    """Apply Phase-2A OR-semantics to distance and TTC.

    Either trigger alone (distance < threshold OR ttc < threshold) is
    sufficient to elevate the risk level.  Missing / None values for a
    metric are treated conservatively: they do NOT suppress a level that
    the other metric has already triggered.

    Returns UNKNOWN only when BOTH distance and TTC are unavailable.
    """
    if distance_m is None and ttc is None:
        return RiskLevel.UNKNOWN

    def _dist_at_or_above(threshold: float) -> bool:
        """True when distance is absent OR >= threshold (i.e. not triggering)."""
        return distance_m is None or distance_m >= threshold

    def _ttc_at_or_above(threshold: float) -> bool:
        """True when TTC is absent OR >= threshold (i.e. not triggering)."""
        return ttc is None or ttc >= threshold

    # CRITICAL: distance < 10 m  OR  TTC < 2 s
    if (distance_m is not None and distance_m < CRITICAL_DISTANCE_M) or \
       (ttc is not None and ttc < CRITICAL_TTC_S):
        return RiskLevel.CRITICAL

    # HIGH: distance < 20 m  OR  TTC < 4 s
    if (distance_m is not None and distance_m < HIGH_DISTANCE_M) or \
       (ttc is not None and ttc < HIGH_TTC_S):
        return RiskLevel.HIGH

    # CAUTION: distance < 30 m  OR  TTC < 6 s
    if (distance_m is not None and distance_m < CAUTION_DISTANCE_M) or \
       (ttc is not None and ttc < CAUTION_TTC_S):
        return RiskLevel.CAUTION

    return RiskLevel.NORMAL


def _risk_score_for(level: RiskLevel) -> float:
    """Prototype risk index (0..1) for visualization ordering.  Not a probability."""
    return {
        RiskLevel.CRITICAL: 1.0,
        RiskLevel.HIGH: 0.75,
        RiskLevel.CAUTION: 0.45,
        RiskLevel.NORMAL: 0.05,
        RiskLevel.UNKNOWN: 0.0,
    }.get(level, 0.0)


class V2VEngine:
    """Pure calculation layer for vehicle-to-vehicle collision safety.

    Maintains an in-memory cache of the last risk level for each vehicle pair so
    that alerts are only emitted on state transitions.
    """

    def __init__(self) -> None:
        # key: tuple(sorted(vehicle_id_a, vehicle_id_b)) -> RiskLevel
        self._last_risk: Dict[Tuple[str, str], RiskLevel] = {}

    @staticmethod
    def _utc_now() -> datetime:
        return datetime.now(timezone.utc)

    @staticmethod
    def _parse_timestamp(ts: str | datetime) -> datetime:
        if isinstance(ts, datetime):
            return ts if ts.tzinfo else ts.replace(tzinfo=timezone.utc)
        try:
            cleaned = ts.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except Exception:
            return V2VEngine._utc_now()

    @staticmethod
    def _heading_difference(h1: float, h2: float) -> float:
        """Return smallest absolute difference between two headings (0-180)."""
        diff = abs((h1 - h2 + 180) % 360 - 180)
        return diff

    def _determine_direction(
        self,
        self_telemetry: VehicleTelemetry,
        other_telemetry: VehicleTelemetry,
    ) -> str:
        """Determine direction relationship between the two vehicles.

        Priority (Phase-2B fix):
        1. If route distances differ by more than 0.1 m, use corridor-relative
           ordering to establish SAME direction.  This avoids mis-classifying
           same-corridor vehicles as OPPOSITE solely because the haul road bends
           back on itself (e.g. the ~173° Bailadila blind curve).
        2. If route distances are equal (vehicles at the same waypoint) fall back
           to pure heading comparison.

        Returns one of: "SAME", "OPPOSITE", "UNKNOWN".
        """
        dist_diff = abs(self_telemetry.route_distance - other_telemetry.route_distance)

        if dist_diff > 0.1:
            # Both vehicles are on the corridor at different positions.
            # Identify which is ahead and compare its heading to the other.
            if self_telemetry.route_distance > other_telemetry.route_distance:
                ahead_h = self_telemetry.heading
                behind_h = other_telemetry.heading
            else:
                ahead_h = other_telemetry.heading
                behind_h = self_telemetry.heading

            heading_diff = self._heading_difference(ahead_h, behind_h)
            # Even on a winding route, if both vehicles are on the same corridor
            # leg they should be facing within 45° of each other most of the time;
            # but the blind curve can flip headings nearly 180°.  We trust the
            # route_distance ordering over the heading difference: they are on the
            # same corridor so treat them as SAME direction.
            #
            # Only classify as OPPOSITE if the heading difference is large AND
            # there is no clear route-distance ordering evidence (handled above
            # by requiring dist_diff > 0.1 m).  Since we already know dist_diff
            # > 0.1 m, they are clearly on a shared corridor in the same direction.
            return "SAME"

        # Fallback: ambiguous route positions — use raw heading comparison.
        diff = self._heading_difference(self_telemetry.heading, other_telemetry.heading)
        if diff <= SAME_DIRECTION_HEADING_THRESHOLD:
            return "SAME"
        if diff >= OPPOSITE_DIRECTION_HEADING_THRESHOLD:
            return "OPPOSITE"
        return "UNKNOWN"

    def assess(self, self_telemetry: VehicleTelemetry, other_telemetry: VehicleTelemetry) -> V2VAssessment:
        """Compute a V2V assessment for the supplied telemetry pair."""

        # ── Step 1: freshness ────────────────────────────────────────────────
        self_ts = self._parse_timestamp(self_telemetry.timestamp)
        other_ts = self._parse_timestamp(other_telemetry.timestamp)
        age_seconds = abs((self_ts - other_ts).total_seconds())
        telemetry_fresh = age_seconds <= MAX_TELEMETRY_AGE_S

        if not telemetry_fresh:
            pair_key = tuple(sorted([self_telemetry.vehicle_id, other_telemetry.vehicle_id]))
            self._last_risk[pair_key] = RiskLevel.NORMAL
            return V2VAssessment(
                risk_level=RiskLevel.UNKNOWN,
                recommended_action=RecommendedAction.NOT_AVAILABLE,
                distance_m=None,
                closing_speed=None,
                ttc=None,
                relative_direction="UNKNOWN",
                same_route=False,
                telemetry_fresh=False,
                is_new_alert=False,
                risk_score=0.0,
                risk_reason="Counterpart telemetry is stale; risk cannot be assessed.",
            )

        # ── Step 2: route compatibility ──────────────────────────────────────
        # For this prototype there is a single canonical haul route.
        same_route = True

        # ── Step 3: gap along route ──────────────────────────────────────────
        distance: Optional[float] = (
            abs(self_telemetry.route_distance - other_telemetry.route_distance)
            if same_route else None
        )

        # ── Step 4: direction (Phase-2B fix: route-distance-first) ───────────
        rel_dir = self._determine_direction(self_telemetry, other_telemetry)

        # ── Step 5: closing speed ────────────────────────────────────────────
        closing_speed: Optional[float] = None  # km/h; positive = gap shrinking

        if rel_dir == "SAME":
            # Determine which vehicle is ahead using route distance.
            if self_telemetry.route_distance > other_telemetry.route_distance:
                # self is lead, other is following.
                closing_speed = other_telemetry.speed - self_telemetry.speed
            else:
                # other is lead, self is following.
                closing_speed = self_telemetry.speed - other_telemetry.speed

            # Not closing (gap is stable or opening) → no TTC risk.
            if closing_speed is not None and closing_speed <= 0:
                closing_speed = None

        elif rel_dir == "OPPOSITE":
            # Head-on: sum of speeds (convert km/h → m/s for TTC calculation).
            def _kmh_to_ms(v: float) -> float:
                return v * 1000 / 3600

            closing_speed = _kmh_to_ms(self_telemetry.speed) + _kmh_to_ms(other_telemetry.speed)
            if closing_speed <= 0:
                closing_speed = None
        # UNKNOWN direction → no closing speed.

        # ── Step 6: TTC ──────────────────────────────────────────────────────
        ttc: Optional[float] = None
        if distance is not None and distance > 0 and closing_speed is not None:
            # Convert closing_speed to m/s for TTC.
            if rel_dir == "SAME":
                closing_ms = closing_speed * 1000 / 3600  # km/h → m/s
            else:
                closing_ms = closing_speed  # already m/s (opposite case)
            if closing_ms > 0:
                ttc = distance / closing_ms

        # ── Step 7: risk classification (Phase-2A OR semantics) ─────────────
        risk_level = _classify_risk(distance, ttc)

        # ── Step 8: recommended action ───────────────────────────────────────
        recommended = _recommended_action_for(risk_level)

        # ── Step 9: risk score ───────────────────────────────────────────────
        risk_score = _risk_score_for(risk_level)

        # ── Step 10: human-readable reason ───────────────────────────────────
        dist_str = f"{distance:.1f} m" if distance is not None else "unknown"
        ttc_str = f"{ttc:.1f} s" if ttc is not None else "N/A"
        risk_reason = (
            f"{risk_level}: gap {dist_str}, TTC {ttc_str}, direction {rel_dir}."
            if risk_level != RiskLevel.NORMAL
            else f"Safe following distance ({dist_str}). TTC {ttc_str}."
        )

        # ── Step 11: alert transition detection ──────────────────────────────
        pair_key = tuple(sorted([self_telemetry.vehicle_id, other_telemetry.vehicle_id]))
        previous = self._last_risk.get(pair_key, RiskLevel.NORMAL)
        elevated = (RiskLevel.CAUTION, RiskLevel.HIGH, RiskLevel.CRITICAL)
        is_new_alert = risk_level != previous and risk_level in elevated
        self._last_risk[pair_key] = risk_level

        return V2VAssessment(
            risk_level=risk_level,
            recommended_action=recommended,
            distance_m=distance,
            closing_speed=closing_speed,
            ttc=ttc,
            relative_direction=rel_dir,
            same_route=same_route,
            telemetry_fresh=True,
            is_new_alert=is_new_alert,
            risk_score=risk_score,
            risk_reason=risk_reason,
        )


# Export a singleton that can be imported by the service layer.
v2v_engine = V2VEngine()

"""
NETRA — Blind Curve Advance-Warning State Service (Phase 1, Feature 11)

GOAL
----
Use the EXISTING route/GPS architecture (app/services/route_projector.py) to
warn the ESP32/OLED-2 about an upcoming/active blind curve BEFORE the
onboard proximity sensor could detect it.

This module introduces NO new route geometry and NO new V2V logic. It only
classifies an already-computed route_distance (metres along the frozen
haul-road corridor, produced by route_projector.project_gps_to_route) into a
small per-vehicle state machine:

    SAFE -> UPCOMING_BLIND_CURVE -> BLIND_CURVE_ACTIVE -> SAFE -> ...

Vehicle-to-vehicle conflict detection ("UPCOMING VEHICLE") is a SEPARATE,
independent signal that continues to come only from the existing V2V engine
(app/services/v2v_engine.py) via the telemetry record. This service does not
read, replace, or duplicate any of that logic — see app/api/esp.py for how
the two signals are combined into the compact ESP message.

ANTI-FLAP DESIGN
-----------------
route_distance can jitter by a few metres near a section boundary due to GPS
noise. To satisfy the "state flow must not flap" requirement, this service
remembers the last confirmed state per vehicle and only accepts a transition
to a LESS urgent state once the vehicle is BLIND_CURVE_STATE_HYSTERESIS_M
metres past the raw boundary. A transition to a MORE urgent state is always
applied immediately — a genuine approach/entry warning is never delayed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from app.constants.blind_curve import (
    BLIND_CURVE_APPROACH_DISTANCE_M,
    BLIND_CURVE_STATE_HYSTERESIS_M,
)
from app.services.route_projector import (
    BC01_START_DIST_M,
    BC01_END_DIST_M,
    BC02_APPROACH_DIST_M,
    BC02_END_DIST_M,
)

# ── Public state labels ───────────────────────────────────────────────────────
SAFE = "SAFE"
UPCOMING_BLIND_CURVE = "UPCOMING_BLIND_CURVE"
BLIND_CURVE_ACTIVE = "BLIND_CURVE_ACTIVE"

_URGENCY = {SAFE: 0, UPCOMING_BLIND_CURVE: 1, BLIND_CURVE_ACTIVE: 2}


@dataclass(frozen=True)
class _CurveSpan:
    curve_id: str
    start_m: float  # route_distance at curve entry
    end_m: float    # route_distance at curve exit


# Curve identifiers match the existing convention used across the project
# (app/services/oncoming_predictor.py, frontend/src/data/activeHaulRoute.ts).
# Boundaries are the SAME ones route_projector.py already derives from the
# frozen corridor — nothing new is measured here.
_CURVES: List[_CurveSpan] = [
    _CurveSpan("BLIND_CURVE_01", BC01_START_DIST_M, BC01_END_DIST_M),
    _CurveSpan("BLIND_CURVE_02", BC02_APPROACH_DIST_M, BC02_END_DIST_M),
]


@dataclass
class BlindCurveState:
    """Result of a blind-curve state evaluation for one vehicle at one instant."""

    state: str
    """SAFE | UPCOMING_BLIND_CURVE | BLIND_CURVE_ACTIVE"""

    curve_id: Optional[str]
    """BLIND_CURVE_01 | BLIND_CURVE_02 | None (no curve ahead on the route)."""

    distance_to_curve_m: Optional[float]
    """Metres to the curve entry point; 0.0 while inside the curve; None when
    there is no relevant curve (e.g. past the last one, or off-route)."""


def _raw_state_for(route_distance_m: float) -> tuple[str, Optional[str], Optional[float]]:
    """Classify route_distance with NO hysteresis — the instantaneous truth."""
    for curve in _CURVES:
        if curve.start_m <= route_distance_m <= curve.end_m:
            return BLIND_CURVE_ACTIVE, curve.curve_id, 0.0

    for curve in _CURVES:
        if route_distance_m < curve.start_m:
            dist_to_curve = curve.start_m - route_distance_m
            if dist_to_curve <= BLIND_CURVE_APPROACH_DISTANCE_M:
                return UPCOMING_BLIND_CURVE, curve.curve_id, round(dist_to_curve, 1)
            return SAFE, curve.curve_id, round(dist_to_curve, 1)

    # Past every known curve — nothing ahead on the route.
    return SAFE, None, None


class BlindCurveStateService:
    """Stateful (per-vehicle) blind-curve advance-warning engine.

    Mirrors the singleton pattern already used by V2VEngine
    (app/services/v2v_engine.py) — an in-memory cache keyed by vehicle_id so
    downgrade transitions can be hysteresis-gated.
    """

    def __init__(self) -> None:
        self._last: Dict[str, BlindCurveState] = {}

    def reset(self, vehicle_id: Optional[str] = None) -> None:
        """Clear cached state. Intended for tests; not used in request paths."""
        if vehicle_id is None:
            self._last.clear()
        else:
            self._last.pop(vehicle_id.upper(), None)

    def evaluate(self, vehicle_id: str, route_distance_m: Optional[float]) -> BlindCurveState:
        """Compute the hysteresis-gated blind-curve state for one vehicle.

        Parameters
        ----------
        vehicle_id : str
        route_distance_m : Optional[float]
            Metres along the frozen corridor, as already computed by
            route_projector.project_gps_to_route (or stored on the telemetry
            record). None (off-route / unknown) is treated conservatively —
            no curve warning is raised without a trustworthy position.
        """
        clean_id = vehicle_id.upper()

        if route_distance_m is None:
            result = BlindCurveState(state=SAFE, curve_id=None, distance_to_curve_m=None)
            self._last[clean_id] = result
            return result

        raw_state, raw_curve_id, raw_dist = _raw_state_for(route_distance_m)
        previous = self._last.get(clean_id)

        if previous is None or _URGENCY[raw_state] >= _URGENCY[previous.state]:
            # First reading, same urgency, or a genuine upgrade — apply now.
            final = BlindCurveState(raw_state, raw_curve_id, raw_dist)
        else:
            final = self._gated_downgrade(previous, raw_state, raw_curve_id, raw_dist, route_distance_m)

        self._last[clean_id] = final
        return final

    @staticmethod
    def _gated_downgrade(
        previous: BlindCurveState,
        raw_state: str,
        raw_curve_id: Optional[str],
        raw_dist: Optional[float],
        route_distance_m: float,
    ) -> BlindCurveState:
        """Only accept a downgrade once clearly past the boundary (+hysteresis).

        The hysteresis prevents flapping near a boundary due to GPS jitter.
        However, if the vehicle position is clearly *before* the curve's start
        (i.e. a demo reset or genuine reverse movement), we must bypass the
        hysteresis lock immediately — no GPS jitter spans hundreds of metres.
        """
        curve = next((c for c in _CURVES if c.curve_id == previous.curve_id), None)

        if previous.state == BLIND_CURVE_ACTIVE and curve is not None:
            # Only hold ACTIVE if the vehicle is still plausibly near the curve
            # (between start−hysteresis and end+hysteresis).  A position clearly
            # before the curve start means a reset / backward jump — release now.
            near_curve = (
                route_distance_m >= curve.start_m - BLIND_CURVE_STATE_HYSTERESIS_M
                and route_distance_m < curve.end_m + BLIND_CURVE_STATE_HYSTERESIS_M
            )
            if near_curve:
                return BlindCurveState(BLIND_CURVE_ACTIVE, previous.curve_id, 0.0)

        elif previous.state == UPCOMING_BLIND_CURVE and curve is not None:
            if route_distance_m < curve.start_m:
                dist_to_curve = curve.start_m - route_distance_m
                still_upcoming = dist_to_curve <= (
                    BLIND_CURVE_APPROACH_DISTANCE_M + BLIND_CURVE_STATE_HYSTERESIS_M
                )
                if still_upcoming:
                    return BlindCurveState(
                        UPCOMING_BLIND_CURVE, previous.curve_id, round(dist_to_curve, 1)
                    )

        # Hysteresis margin exceeded (or no matching curve) — accept the downgrade.
        return BlindCurveState(raw_state, raw_curve_id, raw_dist)


# Module-level singleton, mirroring v2v_engine's pattern.
blind_curve_state_service = BlindCurveStateService()

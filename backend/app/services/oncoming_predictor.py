"""
NETRA — Backend Oncoming Vehicle Predictor (Phase 2D)

Authoritative backend prediction of an oncoming vehicle in a shared mine corridor.

SOURCE: telemetry (route_distance + heading + speed) — NOT the physical proximity sensor.
The prediction occurs BEFORE the TTC/distance risk engine reaches its CAUTION threshold.

Detection conditions (ALL must be satisfied):
  1. Opposite travel direction (heading delta > OPPOSITE_HEADING_THRESHOLD degrees)
  2. Converging — route separation is DECREASING (confirmed by speed vectors)
  3. Both vehicles are moving (speed > MIN_SPEED_MS)
  4. At least one vehicle is within an activation zone (within ACTIVATION_ZONE_M of a blind-curve apex)
  5. Estimated time to conflict point is within CONFLICT_WINDOW_S
  6. Current route separation is > PHYSICAL_CAUTION_THRESHOLD_M  (otherwise the TTC engine already handles it)

Architecture note:
  This module is pure Python — no DB, no WebSocket.
  The telemetry_service calls it and attaches the result to the broadcast payload.
  Frontend reads it from the WebSocket envelope; it does NOT independently predict conflicts.
"""

from __future__ import annotations

from app.services.route_projector import (
    BC01_APEX_DIST_M as _BC01_APEX_DIST_M,
    BC02_APEX_DIST_M as _BC02_APEX_DIST_M,
    ROUTE_TOTAL_LENGTH_M as _ROUTE_TOTAL_LENGTH_M,
)

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from app.schemas.telemetry import VehicleTelemetry

# ── Tunable constants (clearly labelled as PROTOTYPE values) ───────────────────

# Route geometry — derived from route_projector.py which embeds the frozen
# REAL_HAUL_CORRIDOR_PATH (63 vertices, frontend/src/data/realHaulRoad.ts).
# These values update automatically if the frozen route is ever officially changed.
BC01_APEX_DIST_M = _BC01_APEX_DIST_M   # ~198 m (exact: cumulative Haversine to vertex 17)
BC02_APEX_DIST_M = _BC02_APEX_DIST_M   # ~646 m (exact: cumulative Haversine to vertex 46)
ROUTE_LENGTH_M   = _ROUTE_TOTAL_LENGTH_M  # ~847.953 m total frozen route length

# Activation zone: a vehicle must be within this many metres of a curve apex to be eligible.
ACTIVATION_ZONE_M  = 100.0   # metres either side of apex

# An oncoming prediction is emitted when both vehicles will reach the conflict zone
# within this many seconds of each other (at current speeds).
CONFLICT_WINDOW_S  = 35.0    # seconds — prototype value

# Minimum speed for either vehicle to count as "moving".
MIN_SPEED_KMH      = 1.0     # km/h

# Heading delta above which the vehicles are classified as traveling in opposite directions.
OPPOSITE_HEADING_THRESHOLD = 120.0  # degrees

# The prediction must fire BEFORE the physical TTC engine reaches CAUTION (gap < 30 m).
# We only emit a prediction when route separation is larger than this.
PHYSICAL_CAUTION_THRESHOLD_M = 40.0   # metres — slightly above the 30 m CAUTION distance

# Minimum separation decrease rate for convergence confirmation (m/s combined).
MIN_CONVERGING_SPEED_MS = 0.1  # m/s


@dataclass
class BlindCurveApex:
    curve_id: str
    apex_dist_m: float
    activation_start_m: float
    activation_end_m: float


BLIND_CURVE_APEXES: list[BlindCurveApex] = [
    BlindCurveApex(
        curve_id='BLIND_CURVE_01',
        apex_dist_m=BC01_APEX_DIST_M,
        activation_start_m=max(0.0, BC01_APEX_DIST_M - ACTIVATION_ZONE_M),
        activation_end_m=BC01_APEX_DIST_M + ACTIVATION_ZONE_M,
    ),
    BlindCurveApex(
        curve_id='BLIND_CURVE_02',
        apex_dist_m=BC02_APEX_DIST_M,
        activation_start_m=max(0.0, BC02_APEX_DIST_M - ACTIVATION_ZONE_M),
        activation_end_m=min(ROUTE_LENGTH_M, BC02_APEX_DIST_M + ACTIVATION_ZONE_M),  # noqa: E501
    ),
]


@dataclass
class OncomingPrediction:
    """Result of the backend oncoming-vehicle prediction check."""

    predicted: bool
    """True when all conditions are met and a genuine prediction is made."""

    event_id: Optional[str] = None
    """Unique event identifier (UUID4) — shared in the safety command conflict_id."""

    oncoming_vehicle_id: Optional[str] = None
    """vehicle_id of the predicted oncoming vehicle."""

    at_blind_curve_id: Optional[str] = None
    """Which blind curve is the predicted conflict zone."""

    estimated_ttc_s: Optional[float] = None
    """Estimated time-to-conflict based on route positions and combined speed."""

    combined_closing_speed_ms: Optional[float] = None
    """Sum of both vehicles' speeds (m/s) — valid when converging head-on."""

    route_separation_m: Optional[float] = None
    """Current absolute route separation (m) at the time of prediction."""

    detection_source: str = 'TELEMETRY_PREDICTION'
    """Always TELEMETRY_PREDICTION — never claims physical sensor detection."""

    reason: str = ''
    """Human-readable explanation of the prediction decision."""

    confidence: str = 'MEDIUM'
    """HIGH / MEDIUM / LOW — based on how many conditions are strongly met."""


def _heading_delta(h1: float, h2: float) -> float:
    """Smallest absolute heading difference [0, 180]."""
    return abs((h1 - h2 + 180) % 360 - 180)


def _kmh_to_ms(kmh: float) -> float:
    return kmh * 1000.0 / 3600.0


def _in_activation_zone(route_dist_m: float, apex: BlindCurveApex) -> bool:
    return apex.activation_start_m <= route_dist_m <= apex.activation_end_m


def predict_oncoming(
    v1: VehicleTelemetry,
    v2: VehicleTelemetry,
) -> OncomingPrediction:
    """
    Predict whether v1 and v2 are on a converging head-on collision course
    at a blind curve on the shared haul corridor.

    Parameters
    ----------
    v1, v2 : VehicleTelemetry
        Current telemetry records for the two vehicles.

    Returns
    -------
    OncomingPrediction
        .predicted = True  only when ALL detection conditions are satisfied.
        .detection_source is always 'TELEMETRY_PREDICTION'.
    """

    # ── Guard: need valid position data ──────────────────────────────────────
    if v1.route_distance is None or v2.route_distance is None:
        return OncomingPrediction(
            predicted=False,
            reason='Insufficient route_distance data for prediction.',
        )

    # ── Condition 1: opposite direction ────────────────────────────────────────
    hdelta = _heading_delta(v1.heading, v2.heading)
    if hdelta < OPPOSITE_HEADING_THRESHOLD:
        return OncomingPrediction(
            predicted=False,
            reason=f'Heading delta {hdelta:.0f}° < {OPPOSITE_HEADING_THRESHOLD}° — same direction.',
        )

    # ── Condition 2: both vehicles moving ──────────────────────────────────────
    v1_ms = _kmh_to_ms(v1.speed)
    v2_ms = _kmh_to_ms(v2.speed)
    if v1.speed < MIN_SPEED_KMH or v2.speed < MIN_SPEED_KMH:
        return OncomingPrediction(
            predicted=False,
            reason=f'One or both vehicles not moving (v1={v1.speed:.1f} km/h, v2={v2.speed:.1f} km/h).',
        )

    # ── Route separation (ABSOLUTE) ────────────────────────────────────────────
    separation_m = abs(v1.route_distance - v2.route_distance)

    # ── Condition 3: separation is above physical-sensor range ─────────────────
    # If they are already within the TTC engine's alert zone, that engine handles it.
    if separation_m <= PHYSICAL_CAUTION_THRESHOLD_M:
        return OncomingPrediction(
            predicted=False,
            reason=(
                f'Separation {separation_m:.1f} m <= {PHYSICAL_CAUTION_THRESHOLD_M} m: '
                'TTC engine is already active for this conflict.'
            ),
        )

    # ── Condition 4: confirmed converging ─────────────────────────────────────
    # For head-on vehicles: combined closing speed = sum of their speeds.
    combined_closing_ms = v1_ms + v2_ms
    if combined_closing_ms < MIN_CONVERGING_SPEED_MS:
        return OncomingPrediction(
            predicted=False,
            reason='Combined closing speed below minimum threshold — not converging.',
        )

    # ── Condition 5: at least one vehicle in an activation zone ───────────────
    active_curve: Optional[BlindCurveApex] = None
    for apex in BLIND_CURVE_APEXES:
        if _in_activation_zone(v1.route_distance, apex) or _in_activation_zone(v2.route_distance, apex):
            active_curve = apex
            break

    if active_curve is None:
        return OncomingPrediction(
            predicted=False,
            reason=(
                f'Neither vehicle is within {ACTIVATION_ZONE_M} m of a blind-curve apex. '
                'Prediction not yet triggered.'
            ),
        )

    # ── Condition 6: estimated time to conflict within window ─────────────────
    # Estimate when the two vehicles will be at the same route_distance.
    # TTC_head_on = separation / combined_closing_speed
    estimated_ttc_s = separation_m / combined_closing_ms
    if estimated_ttc_s > CONFLICT_WINDOW_S:
        return OncomingPrediction(
            predicted=False,
            reason=(
                f'Estimated TTC {estimated_ttc_s:.1f} s > conflict window {CONFLICT_WINDOW_S} s. '
                'Vehicles not close enough yet for prediction.'
            ),
        )

    # ── All conditions met: emit prediction ───────────────────────────────────
    # Determine which vehicle is "oncoming" from v1's perspective
    oncoming_id = v2.vehicle_id

    confidence = (
        'HIGH'   if estimated_ttc_s < 10 else
        'MEDIUM' if estimated_ttc_s < 22 else
        'LOW'
    )

    event_id = str(uuid.uuid4())[:13].upper().replace('-', '')  # short readable ID

    return OncomingPrediction(
        predicted=True,
        event_id=event_id,
        oncoming_vehicle_id=oncoming_id,
        at_blind_curve_id=active_curve.curve_id,
        estimated_ttc_s=round(estimated_ttc_s, 1),
        combined_closing_speed_ms=round(combined_closing_ms, 2),
        route_separation_m=round(separation_m, 1),
        detection_source='TELEMETRY_PREDICTION',
        reason=(
            f'ONCOMING VEHICLE PREDICTED: {v1.vehicle_id} and {v2.vehicle_id} '
            f'are converging at {active_curve.curve_id}. '
            f'Heading delta={hdelta:.0f}°, separation={separation_m:.0f} m, '
            f'combined closing speed={combined_closing_ms:.1f} m/s, '
            f'estimated TTC={estimated_ttc_s:.1f} s. '
            f'Source: TELEMETRY_PREDICTION (not physical sensor).'
        ),
        confidence=confidence,
    )

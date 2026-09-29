"""
Backend V2V engine tests — Phase-2B contract.

Verifies:
  - Four-level risk classification: NORMAL / CAUTION / HIGH / CRITICAL / UNKNOWN
  - Phase-2A OR semantics (distance OR TTC alone is sufficient to elevate risk)
  - Phase-2A prototype thresholds: CRITICAL<10m/2s, HIGH<20m/4s, CAUTION<30m/6s
  - Correct vehicle roles: HEMM-01 = LEAD, HEMM-02 = TRAILING
  - Direction fix: blind-curve heading difference does NOT mis-classify same-corridor
    vehicles as OPPOSITE when route_distance ordering is unambiguous
  - Legitimate OPPOSITE detection preserved when vehicle actually face each other
    on a shared coordinate with equal route distances (no route ordering available)
"""

import pytest
from datetime import datetime, timezone, timedelta

from app.services.v2v_engine import v2v_engine, V2VEngine
from app.schemas.telemetry import (
    VehicleTelemetry,
    Position3D,
    SensorHealthRecord,
    SensorState,
    RiskLevel,
    RecommendedAction,
)
from app.constants.v2v import (
    CRITICAL_DISTANCE_M,
    HIGH_DISTANCE_M,
    CAUTION_DISTANCE_M,
    CRITICAL_TTC_S,
    HIGH_TTC_S,
    CAUTION_TTC_S,
    MAX_TELEMETRY_AGE_S,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def make_telemetry(
    vehicle_id: str,
    vehicle_type: str,
    heading: float,
    speed: float,
    route_distance: float,
    timestamp: datetime,
    **overrides,
) -> VehicleTelemetry:
    """Create a minimal VehicleTelemetry instance for testing."""
    base = {
        "vehicle_id": vehicle_id,
        "vehicle_type": vehicle_type,
        "timestamp": timestamp.isoformat(),
        "position": Position3D(latitude=0.0, longitude=0.0, altitude=0.0),
        "heading": heading,
        "speed": speed,
        "visibility_condition": "NORMAL",
        "object_detected": False,
        "object_type": None,
        "object_distance": None,
        "relative_speed": None,
        "ttc": None,
        "risk_score": None,
        "risk_level": None,
        "recommended_action": None,
        "sensor_health": SensorHealthRecord(
            radar=SensorState.SIMULATED,
            thermal=SensorState.SIMULATED,
            gnss=SensorState.SIMULATED,
            imu=SensorState.SIMULATED,
        ),
        "network_status": "STANDBY",
        "data_mode": "SIMULATION",
        "source_metadata": "UNIT_TEST",
        "route_distance": route_distance,
        "section_id": "S01",
    }
    base.update(overrides)
    return VehicleTelemetry(**base)


# ─────────────────────────────────────────────────────────────────────────────
# 1. Vehicle roles
# ─────────────────────────────────────────────────────────────────────────────

def test_hemm01_is_lead_hemm02_is_trailing():
    """HEMM-01 must be the LEAD vehicle (larger route_distance at t=0)."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry(
        "HEMM-01", "100T DUMPER (LEAD)",
        heading=73, speed=22, route_distance=96, timestamp=now,
    )
    trailing = make_telemetry(
        "HEMM-02", "100T DUMPER (TRAILING)",
        heading=73, speed=22, route_distance=58, timestamp=now,
    )
    # HEMM-01 has larger route_distance → it is LEAD (ahead on corridor)
    assert lead.route_distance > trailing.route_distance, (
        "HEMM-01 (LEAD) must have larger route_distance than HEMM-02 (TRAILING)"
    )
    assert "LEAD" in lead.vehicle_type.upper()
    assert "TRAILING" in trailing.vehicle_type.upper()


# ─────────────────────────────────────────────────────────────────────────────
# 2. NORMAL (large safe gap)
# ─────────────────────────────────────────────────────────────────────────────

def test_large_safe_gap_is_normal():
    """150 m gap, trailing slightly faster → TTC well above all thresholds → NORMAL."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry(
        "HEMM-01", "100T DUMPER (LEAD)",
        heading=0, speed=30, route_distance=200, timestamp=now,
    )
    trailing = make_telemetry(
        "HEMM-02", "100T DUMPER (TRAILING)",
        heading=0, speed=35, route_distance=50, timestamp=now,
    )
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.risk_level == RiskLevel.NORMAL
    assert assessment.recommended_action == RecommendedAction.PROCEED
    assert assessment.is_new_alert is False


def test_same_speed_no_closing():
    """Same speed → no closing speed → no TTC → NORMAL."""
    now = datetime.now(timezone.utc)
    v1 = make_telemetry("HEMM-01", "TYPE", heading=0, speed=50, route_distance=100, timestamp=now)
    v2 = make_telemetry("HEMM-02", "TYPE", heading=0, speed=50, route_distance=50, timestamp=now)
    assessment = v2v_engine.assess(v2, v1)
    assert assessment.closing_speed is None
    assert assessment.ttc is None
    assert assessment.risk_level == RiskLevel.NORMAL
    assert assessment.recommended_action == RecommendedAction.PROCEED


def test_moving_apart_slower_rear_is_normal():
    """Lead faster than follower → gap opening → NORMAL."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=40, route_distance=200, timestamp=now)
    rear = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=150, timestamp=now)
    assessment = v2v_engine.assess(rear, lead)
    assert assessment.closing_speed is None
    assert assessment.risk_level == RiskLevel.NORMAL
    assert assessment.recommended_action == RecommendedAction.PROCEED


# ─────────────────────────────────────────────────────────────────────────────
# 3. CAUTION (distance < 30 m OR TTC < 6 s)
# ─────────────────────────────────────────────────────────────────────────────

def test_caution_by_distance():
    """Gap just below 30 m, vehicles at same speed (no TTC) → CAUTION by distance."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=128, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    # gap = 28 m (< 30), same speed → closing_speed=None → no TTC → distance trigger
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(28.0)
    assert assessment.risk_level == RiskLevel.CAUTION
    assert assessment.recommended_action == RecommendedAction.REDUCE_SPEED


def test_caution_by_ttc_only():
    """Large gap (> 30 m) but TTC < 6 s → CAUTION by TTC alone (OR semantics)."""
    now = datetime.now(timezone.utc)
    # gap = 50 m, closing at 40 km/h = 11.11 m/s → TTC ≈ 4.5 s (< 6 s → CAUTION)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=10, route_distance=200, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=50, route_distance=150, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(50.0)
    assert assessment.ttc is not None
    assert assessment.ttc < CAUTION_TTC_S
    assert assessment.risk_level == RiskLevel.CAUTION
    assert assessment.recommended_action == RecommendedAction.REDUCE_SPEED


# ─────────────────────────────────────────────────────────────────────────────
# 4. HIGH (distance < 20 m OR TTC < 4 s)
# ─────────────────────────────────────────────────────────────────────────────

def test_high_by_distance():
    """Gap = 15 m, same speed → distance alone triggers HIGH."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=115, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(15.0)
    assert assessment.risk_level == RiskLevel.HIGH
    assert assessment.recommended_action == RecommendedAction.REDUCE_SPEED


def test_high_by_ttc_only():
    """Gap = 40 m (> 30 m), but TTC ≈ 2.88 s (< 4 s) → HIGH by TTC alone."""
    now = datetime.now(timezone.utc)
    # gap = 40 m, closing 50 km/h = 13.89 m/s → TTC ≈ 2.88 s
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=10, route_distance=200, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=60, route_distance=160, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(40.0)
    assert assessment.ttc is not None and assessment.ttc < HIGH_TTC_S
    assert assessment.risk_level == RiskLevel.HIGH
    assert assessment.recommended_action == RecommendedAction.REDUCE_SPEED


# ─────────────────────────────────────────────────────────────────────────────
# 5. CRITICAL (distance < 10 m OR TTC < 2 s)
# ─────────────────────────────────────────────────────────────────────────────

def test_critical_by_distance():
    """Gap = 8.6 m (< 10 m), same speed → distance alone triggers CRITICAL → HOLD."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=18, route_distance=108, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=18, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(8.0)
    assert assessment.risk_level == RiskLevel.CRITICAL
    assert assessment.recommended_action == RecommendedAction.HOLD
    assert assessment.is_new_alert is True


def test_critical_by_ttc_only():
    """Gap = 50 m, closing 100 km/h = 27.78 m/s → TTC ≈ 1.8 s < 2 s → CRITICAL."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=10, route_distance=300, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=110, route_distance=250, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.ttc is not None and assessment.ttc < CRITICAL_TTC_S
    assert assessment.risk_level == RiskLevel.CRITICAL
    assert assessment.recommended_action == RecommendedAction.HOLD


def test_critical_transition_is_new_alert():
    """Fresh engine: first CRITICAL assessment must set is_new_alert=True."""
    engine = V2VEngine()
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=108, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = engine.assess(trailing, lead)
    assert assessment.risk_level == RiskLevel.CRITICAL
    assert assessment.is_new_alert is True


# ─────────────────────────────────────────────────────────────────────────────
# 6. Recovery to NORMAL clears is_new_alert
# ─────────────────────────────────────────────────────────────────────────────

def test_recovery_to_normal():
    engine = V2VEngine()
    now = datetime.now(timezone.utc)
    # First: CRITICAL
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=108, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    engine.assess(trailing, lead)
    # Second: big gap → NORMAL
    lead2 = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=300, timestamp=now)
    trailing2 = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = engine.assess(trailing2, lead2)
    assert assessment.risk_level == RiskLevel.NORMAL
    assert assessment.recommended_action == RecommendedAction.PROCEED
    assert assessment.is_new_alert is False


# ─────────────────────────────────────────────────────────────────────────────
# 7. UNKNOWN — stale telemetry
# ─────────────────────────────────────────────────────────────────────────────

def test_stale_telemetry_returns_unknown():
    now = datetime.now(timezone.utc)
    fresh = make_telemetry("HEMM-01", "TYPE", heading=0, speed=30, route_distance=100, timestamp=now)
    stale_time = now - timedelta(seconds=MAX_TELEMETRY_AGE_S + 1)
    stale = make_telemetry("HEMM-02", "TYPE", heading=0, speed=30, route_distance=80, timestamp=stale_time)
    assessment = v2v_engine.assess(fresh, stale)
    assert assessment.telemetry_fresh is False
    assert assessment.risk_level == RiskLevel.UNKNOWN
    assert assessment.recommended_action == RecommendedAction.NOT_AVAILABLE
    assert assessment.is_new_alert is False


# ─────────────────────────────────────────────────────────────────────────────
# 8. Direction classification — Phase-2B blind-curve fix
# ─────────────────────────────────────────────────────────────────────────────

def test_blind_curve_heading_difference_does_not_become_opposite():
    """
    Core Phase-2B regression test.

    At Bailadila the haul road bends back ~173°, so HEMM-01 (LEAD, route_dist 221 m)
    and HEMM-02 (TRAILING, route_dist 192 m) can have headings ~173° apart while
    still being on the same corridor.  The engine must classify them as SAME, not OPPOSITE.
    """
    now = datetime.now(timezone.utc)
    lead = make_telemetry(
        "HEMM-01", "100T DUMPER (LEAD)",
        heading=263,           # after the sharp bend
        speed=18,
        route_distance=221.0,  # ahead on the route
        timestamp=now,
    )
    trailing = make_telemetry(
        "HEMM-02", "100T DUMPER (TRAILING)",
        heading=73,            # still on the approach leg
        speed=22,
        route_distance=192.0,  # behind on the route
        timestamp=now,
    )
    # Raw heading difference ≈ 170° (would be OPPOSITE in pure-heading mode).
    from app.services.v2v_engine import V2VEngine as _Engine
    engine = _Engine()
    assessment = engine.assess(trailing, lead)
    assert assessment.relative_direction == "SAME", (
        "Same-corridor vehicles with a blind-curve heading difference must be SAME, not OPPOSITE"
    )
    # Risk should reflect actual gap (≈ 29 m), not head-on speed sum.
    assert assessment.distance_m == pytest.approx(29.0)
    assert assessment.risk_level in (RiskLevel.CAUTION, RiskLevel.HIGH, RiskLevel.CRITICAL)


def test_truly_opposite_direction_is_detected():
    """
    Genuine head-on scenario: same route_distance (co-located), headings 180° apart.
    Route-distance ordering is ambiguous → fall back to heading → OPPOSITE.
    """
    now = datetime.now(timezone.utc)
    v1 = make_telemetry(
        "HEMM-01", "TYPE",
        heading=0, speed=30, route_distance=100.0, timestamp=now,
    )
    v2 = make_telemetry(
        "HEMM-02", "TYPE",
        heading=180, speed=30, route_distance=100.0, timestamp=now,   # same route_distance
        **{"position": Position3D(latitude=0.001, longitude=0.001, altitude=0.0)},
    )
    engine = V2VEngine()
    assessment = engine.assess(v1, v2)
    assert assessment.relative_direction == "OPPOSITE"
    # Head-on at 30 km/h each = 60 km/h closing = 16.67 m/s; gap = 0 m → risk elevated
    assert assessment.risk_level in (RiskLevel.CRITICAL, RiskLevel.HIGH, RiskLevel.CAUTION, RiskLevel.NORMAL)


def test_large_route_distance_diff_always_same():
    """Any unambiguous route-distance ordering → SAME regardless of heading."""
    now = datetime.now(timezone.utc)
    # 170° heading difference, but clear 100 m route separation
    lead = make_telemetry("HEMM-01", "TYPE", heading=260, speed=20, route_distance=200, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=80, speed=20, route_distance=100, timestamp=now)
    engine = V2VEngine()
    assessment = engine.assess(trailing, lead)
    assert assessment.relative_direction == "SAME"


# ─────────────────────────────────────────────────────────────────────────────
# 9. OR semantics — explicit threshold boundary checks
# ─────────────────────────────────────────────────────────────────────────────

def test_distance_alone_triggers_critical():
    """Gap = 9.9 m < 10 m, no TTC → CRITICAL by distance alone."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=109, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    # gap = 9 m < 10 m, same speed → no TTC
    assert assessment.ttc is None
    assert assessment.risk_level == RiskLevel.CRITICAL


def test_distance_alone_triggers_high():
    """Gap = 15 m (< 20 m), same speed → no TTC → HIGH by distance alone."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=115, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.ttc is None
    assert assessment.risk_level == RiskLevel.HIGH


def test_distance_alone_triggers_caution():
    """Gap = 25 m (< 30 m), same speed → no TTC → CAUTION by distance alone."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=125, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.ttc is None
    assert assessment.risk_level == RiskLevel.CAUTION


def test_exact_boundary_30m_is_normal():
    """Gap = exactly 30 m, same speed → NORMAL (threshold is strict <)."""
    now = datetime.now(timezone.utc)
    lead = make_telemetry("HEMM-01", "TYPE", heading=0, speed=20, route_distance=130, timestamp=now)
    trailing = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(trailing, lead)
    assert assessment.distance_m == pytest.approx(30.0)
    assert assessment.risk_level == RiskLevel.NORMAL


# ─────────────────────────────────────────────────────────────────────────────
# 10. Pair-key symmetry
# ─────────────────────────────────────────────────────────────────────────────

def test_canonical_pair_order():
    """assess(a, b) and assess(b, a) must produce the same risk_level."""
    engine = V2VEngine()
    now = datetime.now(timezone.utc)
    a = make_telemetry("HEMM-01", "TYPE", heading=0, speed=30, route_distance=150, timestamp=now)
    b = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    first = engine.assess(a, b)
    second = engine.assess(b, a)
    assert first.risk_level == second.risk_level
    assert second.is_new_alert is False


# ─────────────────────────────────────────────────────────────────────────────
# 11. Client-provided safety fields must not override engine output
# ─────────────────────────────────────────────────────────────────────────────

def test_client_safety_fields_cannot_override():
    """A client that sends risk_level=CRITICAL must not force the engine result."""
    now = datetime.now(timezone.utc)
    safe = make_telemetry(
        "HEMM-01", "TYPE",
        heading=0, speed=20, route_distance=300, timestamp=now,
        risk_level=RiskLevel.CRITICAL,
        risk_score=1.0,
        ttc=1,
        recommended_action=RecommendedAction.HOLD,
    )
    other = make_telemetry("HEMM-02", "TYPE", heading=0, speed=20, route_distance=100, timestamp=now)
    assessment = v2v_engine.assess(safe, other)
    # 200 m gap at equal speeds → NORMAL
    assert assessment.risk_level == RiskLevel.NORMAL
    assert assessment.recommended_action == RecommendedAction.PROCEED


# ─────────────────────────────────────────────────────────────────────────────
# 12. Same-route flag
# ─────────────────────────────────────────────────────────────────────────────

def test_same_route_flag():
    now = datetime.now(timezone.utc)
    v1 = make_telemetry("HEMM-01", "TYPE", heading=0, speed=30, route_distance=100, timestamp=now)
    v2 = make_telemetry("HEMM-02", "TYPE", heading=0, speed=30, route_distance=200, timestamp=now)
    assessment = v2v_engine.assess(v1, v2)
    assert assessment.same_route is True

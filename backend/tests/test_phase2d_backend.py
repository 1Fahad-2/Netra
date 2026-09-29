#!/usr/bin/env python3
"""
NETRA — Phase 2D Backend Verifier
Tests the oncoming_predictor and lora_transport modules.

Run with:  python -m pytest backend/tests/test_phase2d_backend.py -v
or:        python backend/tests/test_phase2d_backend.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.services.oncoming_predictor import predict_oncoming, CONFLICT_WINDOW_S, BC01_APEX_DIST_M
from app.services.lora_transport import LoraSimulatedTransport, new_conflict_id
from app.schemas.telemetry import (
    VehicleTelemetry, Position3D, SensorHealthRecord,
    SensorState, RiskLevel, RecommendedAction,
    VisibilityCondition, NetworkStatus, DataMode,
)

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"
_results = []


def _sensor_health(state: str = 'SIMULATED') -> SensorHealthRecord:
    s = SensorState(state)
    return SensorHealthRecord(radar=s, thermal=SensorState('NOT_CONNECTED'), gnss=s, imu=s)


def _make_telemetry(
    vid: str, speed_kmh: float, heading: float, route_dist_m: float
) -> VehicleTelemetry:
    return VehicleTelemetry(
        vehicle_id=vid,
        vehicle_type='100T DUMPER',
        timestamp='2026-09-21T10:00:00Z',
        position=Position3D(latitude=18.65, longitude=81.234, altitude=1040),
        heading=heading,
        speed=speed_kmh,
        visibility_condition=VisibilityCondition.NORMAL,
        object_detected=False,
        object_type=None,
        object_distance=None,
        relative_speed=None,
        ttc=None,
        risk_score=None,
        risk_level=None,
        recommended_action=None,
        sensor_health=_sensor_health(),
        network_status=NetworkStatus.ONLINE,
        data_mode=DataMode.SIMULATION,
        source_metadata='TEST',
        route_distance=route_dist_m,
        section_id='TEST',
    )


def check(name: str, condition: bool, info: str = ''):
    status = PASS if condition else FAIL
    print(f"  [{status}] {name}" + (f" — {info}" if info else ""))
    _results.append(condition)


def test_no_prediction_same_direction():
    """Same-direction vehicles should never trigger an oncoming prediction."""
    print("\n[T1] Same-direction vehicles → no prediction")
    v1 = _make_telemetry('HEMM-01', speed_kmh=20, heading=10, route_dist_m=50)
    v2 = _make_telemetry('HEMM-02', speed_kmh=20, heading=15, route_dist_m=80)  # heading delta only 5°
    r = predict_oncoming(v1, v2)
    check("predicted=False for same direction", not r.predicted, r.reason[:80])


def test_no_prediction_not_in_activation_zone():
    """Opposite headings but neither vehicle in an activation zone → no prediction."""
    print("\n[T2] Opposite direction but outside activation zone → no prediction")
    # BC01 apex ≈ 152 m; activation zone = [52, 252]. Place both far from it.
    v1 = _make_telemetry('HEMM-01', speed_kmh=20, heading=5,   route_dist_m=10)   # dist 10 m, far from apex
    v2 = _make_telemetry('HEMM-02', speed_kmh=20, heading=185, route_dist_m=700)  # far end
    r = predict_oncoming(v1, v2)
    check("predicted=False outside zone", not r.predicted, r.reason[:80])


def test_prediction_fires_in_zone():
    """
    Both opposite, one in BC01 activation zone, separation > 40 m, TTC < 35 s.
    Prediction must fire.
    """
    print("\n[T3] Opposite, one in BC01 zone, realistic closing → predicted=True")
    # HEMM-01 at dist 100 m (inside activation zone: [52, 252])
    # HEMM-02 at dist 250 m (also inside activation zone end)
    # heading delta ~170° → clearly opposite
    # separation = 150 m, closing speed = 40 km/h = 11.1 m/s, TTC ≈ 13.5 s < 35 s
    v1 = _make_telemetry('HEMM-01', speed_kmh=20, heading=5,   route_dist_m=100)
    v2 = _make_telemetry('HEMM-02', speed_kmh=20, heading=185, route_dist_m=250)
    r = predict_oncoming(v1, v2)
    check("predicted=True", r.predicted, r.reason[:100])
    check("detection_source=TELEMETRY_PREDICTION", r.detection_source == 'TELEMETRY_PREDICTION')
    check("oncoming_vehicle_id=HEMM-02", r.oncoming_vehicle_id == 'HEMM-02')
    check("at_blind_curve_id not None", r.at_blind_curve_id is not None, r.at_blind_curve_id)
    check("estimated_ttc_s > 0", r.estimated_ttc_s is not None and r.estimated_ttc_s > 0,
          f"TTC={r.estimated_ttc_s}")
    check("route_separation_m=150", r.route_separation_m == 150.0, f"sep={r.route_separation_m}")
    check("combined_closing_speed > 0", r.combined_closing_speed_ms is not None and r.combined_closing_speed_ms > 0)


def test_no_prediction_separation_too_small():
    """When separation <= 40 m the TTC engine is already active — no prediction emitted."""
    print("\n[T4] Separation within physical caution threshold → no prediction")
    v1 = _make_telemetry('HEMM-01', speed_kmh=8, heading=5,   route_dist_m=145)
    v2 = _make_telemetry('HEMM-02', speed_kmh=8, heading=185, route_dist_m=155)  # sep=10 m
    r = predict_oncoming(v1, v2)
    check("predicted=False (TTC engine active)", not r.predicted, r.reason[:80])


def test_no_prediction_ttc_too_large():
    """TTC > conflict window → no prediction (vehicles not close enough yet)."""
    print("\n[T5] Estimated TTC > window → no prediction")
    # separation 700 m, closing 10 m/s → TTC = 70 s > 35 s
    v1 = _make_telemetry('HEMM-01', speed_kmh=18, heading=5,   route_dist_m=120)
    v2 = _make_telemetry('HEMM-02', speed_kmh=18, heading=185, route_dist_m=820)  # far end
    r = predict_oncoming(v1, v2)
    check("predicted=False (TTC too large)", not r.predicted, r.reason[:80])


def test_no_prediction_stationary():
    """A stationary vehicle must not trigger a prediction."""
    print("\n[T6] One vehicle stationary → no prediction")
    v1 = _make_telemetry('HEMM-01', speed_kmh=0, heading=5,   route_dist_m=100)
    v2 = _make_telemetry('HEMM-02', speed_kmh=20, heading=185, route_dist_m=250)
    r = predict_oncoming(v1, v2)
    check("predicted=False (stationary)", not r.predicted, r.reason[:80])


def test_lora_transport_sends_commands():
    """LoRa transport must produce unique command_ids but shared conflict_id."""
    print("\n[T7] LoRa transport: unique command_ids, shared conflict_id")
    t = LoraSimulatedTransport()
    cid = new_conflict_id()
    cmds = t.send_to_both_vehicles(
        vehicle_ids=['HEMM-01', 'HEMM-02'],
        conflict_id=cid,
        safety_level='HIGH',
        action='REDUCE_SPEED',
        reason='Test prediction',
    )
    check("Two commands issued", len(cmds) == 2, f"got {len(cmds)}")
    check("Shared conflict_id", cmds[0].conflict_id == cmds[1].conflict_id == cid)
    check("Unique command_ids", cmds[0].command_id != cmds[1].command_id,
          f"{cmds[0].command_id} vs {cmds[1].command_id}")
    check("Correct vehicle IDs", {c.vehicle_id for c in cmds} == {'HEMM-01', 'HEMM-02'})
    check("transport=LORA_SIMULATED", all(c.transport == 'LORA_SIMULATED' for c in cmds))
    check("action=REDUCE_SPEED", all(c.action == 'REDUCE_SPEED' for c in cmds))


def test_lora_history_retrieval():
    """Last-commands retrieval must reflect all commands sent."""
    print("\n[T8] LoRa transport: history tracks all sent commands")
    t = LoraSimulatedTransport()
    cid = new_conflict_id()
    t.send_to_both_vehicles(['HEMM-01', 'HEMM-02'], cid, 'HIGH', 'REDUCE_SPEED', 'test')
    t.send_to_vehicle('HEMM-01', new_conflict_id(), 'NORMAL', 'PROCEED', 'cleared')
    history = t.get_last_commands()
    check("History has 3 commands", len(history) == 3, f"got {len(history)}")
    check("Transport status LORA_SIMULATED", t.get_transport_status() == 'LORA_SIMULATED')


# ── Run all tests ─────────────────────────────────────────────────────────────

if __name__ == '__main__':
    print("=" * 64)
    print("NETRA Phase 2D Backend Verifier")
    print("=" * 64)
    test_no_prediction_same_direction()
    test_no_prediction_not_in_activation_zone()
    test_prediction_fires_in_zone()
    test_no_prediction_separation_too_small()
    test_no_prediction_ttc_too_large()
    test_no_prediction_stationary()
    test_lora_transport_sends_commands()
    test_lora_history_retrieval()

    passed = sum(_results)
    total = len(_results)
    print(f"\n{'=' * 64}")
    print(f"Result: {passed}/{total} assertions passed")
    if passed == total:
        print("\033[92mALL PASS\033[0m — Phase 2D backend predictor verified.")
    else:
        print("\033[91mFAILURES DETECTED\033[0m")
    sys.exit(0 if passed == total else 1)

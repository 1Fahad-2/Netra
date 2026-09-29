"""
Minimal tests for Network Status + Local Event Buffer (Feature 3A).

Verifies:
  - ONLINE: submitted Compact Events are NOT buffered (pass-through), and
    the buffer stays empty.
  - OFFLINE: submitted Compact Events are buffered instead of discarded.
  - Multiple buffered events accumulate without loss.
  - Network recovery (OFFLINE -> ONLINE) does not itself discard or alter
    what is already buffered; buffered events remain retrievable.
  - Original order and timestamps are preserved exactly as submitted.
  - The buffer can be cleared/retrieved (peek vs. drain semantics).

Does NOT test risk calculation, route projection, sensor health, LoRa
hardware, or actual Store-and-Forward backend sync — all unchanged/out of
scope for this feature.
"""

from app.schemas.compact_event import (
    CompactEvent,
    CompactGps,
    build_simulated_sensor_health,
)
from app.schemas.telemetry import RiskLevel, RecommendedAction
from app.services.network_buffer import NetworkBufferService, NetworkState


def _make_event(vehicle_id: str = "HEMM-01", timestamp: str = "2026-01-01T00:00:00.000Z") -> CompactEvent:
    return CompactEvent(
        vehicle_id=vehicle_id,
        timestamp=timestamp,
        gps=CompactGps(lat=18.61, lon=81.23),
        speed=25.0,
        risk_level=RiskLevel.NORMAL,
        risk_type="NONE",
        confidence=0.1,
        distance_m=None,
        ttc_s=None,
        recommended_action=RecommendedAction.PROCEED,
        sensor_health=build_simulated_sensor_health(),
        network_status="LORA",
        edge_processed=True,
    )


def test_default_state_is_online():
    svc = NetworkBufferService()
    assert svc.get_status() == NetworkState.ONLINE
    assert svc.is_online() is True


def test_online_event_is_not_buffered():
    svc = NetworkBufferService(initial_state=NetworkState.ONLINE)
    event = _make_event()
    result = svc.submit_event(event)

    assert result["status"] == "SENT"
    assert svc.buffer_size() == 0
    assert svc.peek_buffered_events() == []


def test_offline_event_is_buffered_not_discarded():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    event = _make_event(vehicle_id="HEMM-02", timestamp="2026-01-01T00:00:01.000Z")
    result = svc.submit_event(event)

    assert result["status"] == "BUFFERED"
    assert svc.buffer_size() == 1
    buffered = svc.peek_buffered_events()
    assert len(buffered) == 1
    # Original vehicle_id and timestamp must be preserved exactly.
    assert buffered[0].vehicle_id == "HEMM-02"
    assert buffered[0].timestamp == "2026-01-01T00:00:01.000Z"


def test_multiple_buffered_events_accumulate():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    for i in range(5):
        svc.submit_event(_make_event(timestamp=f"2026-01-01T00:00:0{i}.000Z"))

    assert svc.buffer_size() == 5
    assert len(svc.peek_buffered_events()) == 5


def test_timestamp_and_order_preserved_across_multiple_events():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    timestamps = [
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:05.000Z",
        "2026-01-01T00:00:10.000Z",
    ]
    for ts in timestamps:
        svc.submit_event(_make_event(timestamp=ts))

    buffered = svc.peek_buffered_events()
    assert [e.timestamp for e in buffered] == timestamps


def test_local_safety_simulation_continues_while_offline():
    """
    Going OFFLINE must not prevent new Compact Events from being generated
    and handed to the service — they must simply be buffered instead of
    lost. This simulates a stream of events continuing to be produced
    while the network is down.
    """
    svc = NetworkBufferService(initial_state=NetworkState.ONLINE)
    svc.submit_event(_make_event(timestamp="2026-01-01T00:00:00.000Z"))
    assert svc.buffer_size() == 0  # went out normally while ONLINE

    svc.set_status(NetworkState.OFFLINE)
    for i in range(1, 4):
        svc.submit_event(_make_event(timestamp=f"2026-01-01T00:00:0{i}.000Z"))

    # Event generation continued uninterrupted; all 3 offline events kept.
    assert svc.buffer_size() == 3


def test_network_recovery_makes_buffered_events_available_for_sync():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    svc.submit_event(_make_event(timestamp="2026-01-01T00:00:00.000Z"))
    svc.submit_event(_make_event(timestamp="2026-01-01T00:00:01.000Z"))

    # Network recovers.
    svc.set_status(NetworkState.ONLINE)
    assert svc.is_online() is True

    # Recovery alone must not discard the buffer — it stays available.
    assert svc.buffer_size() == 2
    pending = svc.peek_buffered_events()
    assert [e.timestamp for e in pending] == [
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:01.000Z",
    ]

    # A subsequent event submitted after recovery is sent normally, not buffered.
    result = svc.submit_event(_make_event(timestamp="2026-01-01T00:00:02.000Z"))
    assert result["status"] == "SENT"
    assert svc.buffer_size() == 2  # unchanged by the new ONLINE submission


def test_drain_returns_events_and_clears_buffer():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    svc.submit_event(_make_event(timestamp="2026-01-01T00:00:00.000Z"))
    svc.submit_event(_make_event(timestamp="2026-01-01T00:00:01.000Z"))

    drained = svc.drain_buffered_events()
    assert len(drained) == 2
    assert svc.buffer_size() == 0
    assert svc.peek_buffered_events() == []


def test_clear_buffer_empties_without_returning_events():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    svc.submit_event(_make_event())
    assert svc.buffer_size() == 1

    svc.clear_buffer()
    assert svc.buffer_size() == 0


def test_peek_does_not_mutate_buffer():
    svc = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    svc.submit_event(_make_event())

    first_peek = svc.peek_buffered_events()
    second_peek = svc.peek_buffered_events()
    assert len(first_peek) == 1
    assert len(second_peek) == 1
    assert svc.buffer_size() == 1


if __name__ == "__main__":
    test_default_state_is_online()
    test_online_event_is_not_buffered()
    test_offline_event_is_buffered_not_discarded()
    test_multiple_buffered_events_accumulate()
    test_timestamp_and_order_preserved_across_multiple_events()
    test_local_safety_simulation_continues_while_offline()
    test_network_recovery_makes_buffered_events_available_for_sync()
    test_drain_returns_events_and_clears_buffer()
    test_clear_buffer_empties_without_returning_events()
    test_peek_does_not_mutate_buffer()
    print("All network buffer tests passed")

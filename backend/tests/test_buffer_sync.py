"""
Minimal tests for Buffered Event Sync (Feature 3B).

Verifies:
  - Successful sync: buffered events are delivered via backend_send_fn and
    counted as synced.
  - The buffer is only cleared for events the backend actually accepted.
  - A failed event is retained (not lost, not falsely reported synced).
  - FIFO order is preserved when delivering to the backend.
  - Original vehicle_id/timestamp are preserved exactly as passed to the
    backend send function.
  - Retry after failure: a later successful sync call picks up where the
    previous failed one left off, still in original order.

Uses a fresh NetworkBufferService + BufferSyncService per test (not the
module singletons) so tests do not interfere with each other, mirroring
the pattern in test_network_buffer.py. A simple fake `backend_send_fn` is
used instead of the real TelemetryService/DB, since this feature only
needs to prove the sync ORCHESTRATION logic (FIFO, remove-after-success,
retain-on-failure) — the actual persistence call
(TelemetryService.record_buffer_sync_event) reuses the existing SystemEvent
pipeline and is not re-tested here.

Does NOT test risk calculation, route projection, sensor health, LoRa
hardware, or dashboard UI — all unchanged/out of scope for this feature.
"""

from app.schemas.compact_event import (
    CompactEvent,
    CompactGps,
    build_simulated_sensor_health,
)
from app.schemas.telemetry import RiskLevel, RecommendedAction
from app.services.network_buffer import NetworkBufferService, NetworkState
from app.services.buffer_sync import BufferSyncService


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


class _AlwaysAcceptBackend:
    """Fake backend that accepts every event, recording call order."""

    def __init__(self) -> None:
        self.calls: list[CompactEvent] = []

    def __call__(self, event: CompactEvent) -> bool:
        self.calls.append(event)
        return True


class _FailNthBackend:
    """Fake backend that fails on the Nth call (1-indexed), accepts otherwise."""

    def __init__(self, fail_on_call: int) -> None:
        self.fail_on_call = fail_on_call
        self.calls: list[CompactEvent] = []

    def __call__(self, event: CompactEvent) -> bool:
        self.calls.append(event)
        return len(self.calls) != self.fail_on_call


def test_successful_sync_delivers_all_buffered_events():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    for i in range(3):
        buf.submit_event(_make_event(vehicle_id="HEMM-01", timestamp=f"2026-01-01T00:00:0{i}.000Z"))

    buf.set_status(NetworkState.ONLINE)
    sync = BufferSyncService(buffer_service=buf)
    backend = _AlwaysAcceptBackend()

    status = sync.sync_pending_events(backend)

    assert status.synced_count == 3
    assert status.failed_count == 0
    assert status.buffered_count == 0
    assert status.last_sync_time is not None
    assert len(backend.calls) == 3


def test_buffer_cleared_only_after_backend_success():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    buf.submit_event(_make_event())
    buf.set_status(NetworkState.ONLINE)
    assert buf.buffer_size() == 1

    sync = BufferSyncService(buffer_service=buf)

    def rejecting_backend(event: CompactEvent) -> bool:
        return False

    status = sync.sync_pending_events(rejecting_backend)

    # Not accepted -> must remain buffered, not cleared.
    assert status.synced_count == 0
    assert status.failed_count == 1
    assert buf.buffer_size() == 1
    assert status.buffered_count == 1


def test_failed_event_is_retained_not_lost():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    buf.submit_event(_make_event(vehicle_id="HEMM-02", timestamp="2026-01-01T00:00:05.000Z"))
    buf.set_status(NetworkState.ONLINE)

    sync = BufferSyncService(buffer_service=buf)
    backend = _FailNthBackend(fail_on_call=1)

    sync.sync_pending_events(backend)

    remaining = buf.peek_buffered_events()
    assert len(remaining) == 1
    assert remaining[0].vehicle_id == "HEMM-02"
    assert remaining[0].timestamp == "2026-01-01T00:00:05.000Z"


def test_sync_preserves_fifo_order():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    order = [
        ("HEMM-01", "2026-01-01T00:00:00.000Z"),
        ("HEMM-02", "2026-01-01T00:00:01.000Z"),
        ("HEMM-01", "2026-01-01T00:00:02.000Z"),
    ]
    for vid, ts in order:
        buf.submit_event(_make_event(vehicle_id=vid, timestamp=ts))
    buf.set_status(NetworkState.ONLINE)

    sync = BufferSyncService(buffer_service=buf)
    backend = _AlwaysAcceptBackend()
    sync.sync_pending_events(backend)

    delivered_order = [(e.vehicle_id, e.timestamp) for e in backend.calls]
    assert delivered_order == order


def test_original_vehicle_id_and_timestamp_preserved_to_backend():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    buf.submit_event(_make_event(vehicle_id="HEMM-02", timestamp="2026-03-04T05:06:07.000Z"))
    buf.set_status(NetworkState.ONLINE)

    sync = BufferSyncService(buffer_service=buf)
    backend = _AlwaysAcceptBackend()
    sync.sync_pending_events(backend)

    assert len(backend.calls) == 1
    assert backend.calls[0].vehicle_id == "HEMM-02"
    assert backend.calls[0].timestamp == "2026-03-04T05:06:07.000Z"


def test_retry_after_failure_delivers_remaining_events_in_order():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    order = [
        ("HEMM-01", "2026-01-01T00:00:00.000Z"),
        ("HEMM-01", "2026-01-01T00:00:01.000Z"),
    ]
    for vid, ts in order:
        buf.submit_event(_make_event(vehicle_id=vid, timestamp=ts))
    buf.set_status(NetworkState.ONLINE)

    sync = BufferSyncService(buffer_service=buf)

    # First attempt: backend rejects everything (e.g. transient outage).
    first_status = sync.sync_pending_events(lambda event: False)
    assert first_status.synced_count == 0
    assert first_status.failed_count == 1
    assert buf.buffer_size() == 2  # nothing lost

    # Retry: backend now accepts. Both events must still be delivered,
    # in original order, on this later attempt.
    backend = _AlwaysAcceptBackend()
    second_status = sync.sync_pending_events(backend)

    assert second_status.synced_count == 2
    assert buf.buffer_size() == 0
    delivered_order = [(e.vehicle_id, e.timestamp) for e in backend.calls]
    assert delivered_order == order


def test_sync_is_noop_while_offline():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    buf.submit_event(_make_event())

    sync = BufferSyncService(buffer_service=buf)
    backend = _AlwaysAcceptBackend()
    status = sync.sync_pending_events(backend)

    # Still offline -> no delivery attempted, event stays buffered.
    assert backend.calls == []
    assert status.synced_count == 0
    assert buf.buffer_size() == 1


def test_backend_exception_is_treated_as_failure_not_lost_event():
    buf = NetworkBufferService(initial_state=NetworkState.OFFLINE)
    buf.submit_event(_make_event())
    buf.set_status(NetworkState.ONLINE)

    sync = BufferSyncService(buffer_service=buf)

    def raising_backend(event: CompactEvent) -> bool:
        raise RuntimeError("simulated backend outage")

    status = sync.sync_pending_events(raising_backend)

    assert status.synced_count == 0
    assert status.failed_count == 1
    assert buf.buffer_size() == 1  # event preserved, not lost


if __name__ == "__main__":
    test_successful_sync_delivers_all_buffered_events()
    test_buffer_cleared_only_after_backend_success()
    test_failed_event_is_retained_not_lost()
    test_sync_preserves_fifo_order()
    test_original_vehicle_id_and_timestamp_preserved_to_backend()
    test_retry_after_failure_delivers_remaining_events_in_order()
    test_sync_is_noop_while_offline()
    test_backend_exception_is_treated_as_failure_not_lost_event()
    print("All buffer sync tests passed")

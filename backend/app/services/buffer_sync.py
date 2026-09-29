"""
NETRA — Buffered Event Sync (Feature 3B)

Goal (deliberately small):
  Once the network is back ONLINE, send Compact Events that were buffered
  by the Feature 3A NetworkBufferService to the EXISTING backend
  telemetry/event pipeline, in original FIFO order, removing each event
  from the buffer only after the backend has actually accepted it.

Scope:
  - Reuses app.services.network_buffer.network_buffer_service (Feature 3A)
    as-is for buffering/state; only two small single-event accessor
    methods were added there (peek_front / remove_front_if_match).
  - Reuses the EXISTING backend persistence pipeline — by default
    TelemetryService.record_buffer_sync_event(), which itself reuses the
    existing SystemEvent audit table/repository — instead of building any
    new/duplicate telemetry ingestion path.
  - Does NOT implement dashboard UI, real LoRa/hardware, new risk
    algorithms, route changes, or safety-threshold changes.

Failure handling:
  - Buffer is a strict FIFO queue. Sync processes events oldest-first.
  - An event is removed from the buffer ONLY after the backend accepts it
    (backend_send_fn returns True).
  - On the first failure (backend_send_fn returns False or raises),
    processing stops immediately for that sync call: the failed event and
    everything still behind it in the queue remain buffered, untouched, in
    their original order, for the next retry. Nothing is ever dropped, and
    a failed/partial sync is never reported as fully successful.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Callable, Optional

from app.schemas.compact_event import CompactEvent
from app.services.network_buffer import network_buffer_service, NetworkBufferService

# A backend "send" callable: takes one CompactEvent, returns True on
# confirmed backend acceptance, False on failure. Must never raise to
# signal success — exceptions are treated as failures by sync_pending_events.
BackendSendFn = Callable[[CompactEvent], bool]


@dataclass
class SyncStatus:
    """Minimal sync status surface required by Feature 3B."""

    buffered_count: int
    synced_count: int
    failed_count: int
    last_sync_time: Optional[str]


class BufferSyncService:
    """
    Small, reusable sync orchestrator layered on top of NetworkBufferService.

    Does not talk to any transport itself — it drives a caller-supplied
    `backend_send_fn`, which by default is the existing
    TelemetryService.record_buffer_sync_event (see sync_pending_events()'s
    default in app/api/network.py), so no duplicate telemetry pipeline is
    introduced.
    """

    def __init__(self, buffer_service: NetworkBufferService = network_buffer_service) -> None:
        self._buffer_service = buffer_service
        self._lock = threading.Lock()
        self._synced_count = 0
        self._failed_count = 0
        self._last_sync_time: Optional[str] = None

    @staticmethod
    def _utc_now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    def sync_pending_events(self, backend_send_fn: BackendSendFn) -> SyncStatus:
        """
        Attempt to deliver every currently buffered CompactEvent, oldest
        first, via `backend_send_fn`.

        Only runs while the network is ONLINE — if OFFLINE, this is a
        no-op that just reports current status, since there is nothing
        sensible to "sync" to while the vehicle-side link is down.

        For each event, in FIFO order:
          - call backend_send_fn(event)
          - if it returns True: remove exactly that event from the buffer
            and count it as synced
          - if it returns False or raises: count it as a failed attempt,
            leave it (and everything behind it) buffered, and STOP this
            sync call so FIFO order and retry-ability are preserved
        """
        with self._lock:
            if self._buffer_service.is_online():
                while True:
                    event = self._buffer_service.peek_front()
                    if event is None:
                        break  # nothing left to sync

                    try:
                        accepted = bool(backend_send_fn(event))
                    except Exception:
                        accepted = False

                    if accepted:
                        if self._buffer_service.remove_front_if_match(event):
                            self._synced_count += 1
                    else:
                        self._failed_count += 1
                        break  # preserve FIFO order; retry later

            self._last_sync_time = self._utc_now_iso()
            return self._status_locked()

    def _status_locked(self) -> SyncStatus:
        return SyncStatus(
            buffered_count=self._buffer_service.buffer_size(),
            synced_count=self._synced_count,
            failed_count=self._failed_count,
            last_sync_time=self._last_sync_time,
        )

    def get_status(self) -> SyncStatus:
        """Minimal sync status: buffered_count, synced_count, failed_count, last_sync_time."""
        with self._lock:
            return self._status_locked()

    def reset_counters(self) -> None:
        """Reset the synced/failed counters and last_sync_time. Does not touch the buffer itself."""
        with self._lock:
            self._synced_count = 0
            self._failed_count = 0
            self._last_sync_time = None


# ── Module singleton ────────────────────────────────────────────────────
# Mirrors the singleton pattern used by network_buffer_service /
# lora_transport so the rest of the app shares one sync-status instance.
buffer_sync_service = BufferSyncService()

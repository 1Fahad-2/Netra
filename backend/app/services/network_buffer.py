"""
NETRA — Network Status + Local Event Buffer (Feature 3A)

(Feature 3B — Buffered Event Sync — reuses this exact service unchanged in
its core behavior, adding only two small single-event accessor methods
below, `peek_front` / `remove_front_if_match`, so a sync operation can
remove one event at a time strictly after backend acceptance. See
app/services/buffer_sync.py.)

Goal (deliberately small):
  When vehicle-side network connectivity is unavailable, Compact Event
  generation must continue uninterrupted and the resulting events must be
  held in a local, in-memory buffer instead of being lost. Once
  connectivity returns, the buffered events must be retrievable, in their
  original order, for a later synchronization step.

Scope:
  - This module is a PURE, reusable, in-process service. It does NOT:
      * recompute or touch risk_level / risk_score / safety thresholds
      * change route/projection logic
      * change the CompactEvent contract or any of its fields
      * change the sensor-health contract
      * touch hardware/LoRa integration or the dashboard UI
      * implement the actual Store-and-Forward backend synchronization
        (it only makes buffered events available for that future step)
  - It only tracks two states, ONLINE / OFFLINE, and routes already-built
    CompactEvent objects to either "pass through" (ONLINE) or "buffer"
    (OFFLINE), preserving each event's original vehicle_id/timestamp and
    the order they were submitted in.

Thread-safety:
  Mirrors the pattern used by app/services/lora_transport.py — a single
  threading.Lock guards the small amount of shared state so this service
  can be called safely from concurrent request handlers.
"""

from __future__ import annotations

import threading
from collections import deque
from enum import StrEnum
from typing import Deque, List

from app.schemas.compact_event import CompactEvent


class NetworkState(StrEnum):
    """Vehicle-side connectivity state tracked by this module only.

    Distinct from `app.schemas.telemetry.NetworkStatus` (a per-telemetry
    contract field) — this enum represents the live connectivity state used
    to decide whether a freshly generated Compact Event can be handed off
    immediately or must be buffered locally.
    """

    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"


class NetworkBufferService:
    """
    Small, reusable, in-memory service that:
      1. Tracks current network connectivity (ONLINE / OFFLINE).
      2. When ONLINE, does not intervene — Compact Events continue through
         the existing pipeline normally.
      3. When OFFLINE, holds newly submitted Compact Events in a local FIFO
         buffer rather than discarding them.
      4. Once back ONLINE, exposes the buffered events (oldest first, with
         their original timestamps/order intact) so a future
         synchronization step can pick them up. Draining the buffer does
         NOT perform any network call — actual Store-and-Forward sync is
         explicitly out of scope for this feature.

    Local safety/simulation event GENERATION happens upstream of this
    service (unaffected by it either way); this service only decides what
    happens to an already-built CompactEvent once it exists.
    """

    def __init__(self, initial_state: NetworkState = NetworkState.ONLINE) -> None:
        self._lock = threading.Lock()
        self._state: NetworkState = initial_state
        self._buffer: Deque[CompactEvent] = deque()

    # ── network status ──────────────────────────────────────────────────

    def get_status(self) -> NetworkState:
        """Return the current network status."""
        with self._lock:
            return self._state

    def set_status(self, state: NetworkState) -> NetworkState:
        """
        Update the current network status.

        Note: flipping to ONLINE does not itself flush or send the buffer —
        it only changes how *future* submit_event() calls are routed. The
        buffered events remain available via peek/drain until a
        synchronization step (out of scope here) retrieves them.
        """
        with self._lock:
            self._state = state
            return self._state

    def is_online(self) -> bool:
        return self.get_status() == NetworkState.ONLINE

    # ── event handling ──────────────────────────────────────────────────

    def submit_event(self, event: CompactEvent) -> dict:
        """
        Route one already-generated CompactEvent according to the current
        network status. Never discards the event.

          ONLINE  -> not buffered; existing pipeline continues to handle it
                     normally. Returns {"status": "SENT", ...}.
          OFFLINE -> appended to the local buffer, preserving the event's
                     original vehicle_id/timestamp and submission order.
                     Returns {"status": "BUFFERED", ...}.
        """
        with self._lock:
            if self._state == NetworkState.OFFLINE:
                self._buffer.append(event)
                return {
                    "status": "BUFFERED",
                    "vehicle_id": event.vehicle_id,
                    "timestamp": event.timestamp,
                    "buffered_count": len(self._buffer),
                }
            return {
                "status": "SENT",
                "vehicle_id": event.vehicle_id,
                "timestamp": event.timestamp,
                "buffered_count": len(self._buffer),
            }

    # ── buffer access ───────────────────────────────────────────────────

    def buffer_size(self) -> int:
        with self._lock:
            return len(self._buffer)

    def peek_buffered_events(self) -> List[CompactEvent]:
        """
        Return a copy of every currently buffered event, oldest first,
        WITHOUT clearing the buffer. Original order/timestamps are
        preserved exactly as submitted.
        """
        with self._lock:
            return list(self._buffer)

    def drain_buffered_events(self) -> List[CompactEvent]:
        """
        Return all buffered events (oldest first, original order/timestamps
        preserved) and clear the buffer in the same atomic step.

        Intended to be called by a future synchronization step once the
        network is back ONLINE, to hand the buffered events off for
        transmission. This method does not implement or perform that
        transmission itself.
        """
        with self._lock:
            events = list(self._buffer)
            self._buffer.clear()
            return events

    def clear_buffer(self) -> None:
        """Explicitly clear the buffer without returning its contents."""
        with self._lock:
            self._buffer.clear()

    # ── single-event access (Feature 3B sync support) ───────────────────
    # Small additions reused by the Feature 3B sync operation so it can
    # remove exactly one event ONLY after the backend has accepted it,
    # instead of draining the whole buffer speculatively.

    def peek_front(self) -> CompactEvent | None:
        """Return the oldest buffered event without removing it, or None."""
        with self._lock:
            return self._buffer[0] if self._buffer else None

    def remove_front_if_match(self, event: CompactEvent) -> bool:
        """
        Remove the oldest buffered event ONLY if it is still exactly the
        given event (identity check), and report whether it was removed.

        Used by the sync operation to atomically drop an event right after
        (and only after) confirmed backend acceptance, without disturbing
        FIFO order or discarding anything that has not been accepted yet.
        """
        with self._lock:
            if self._buffer and self._buffer[0] is event:
                self._buffer.popleft()
                return True
            return False


# ── Module singleton ────────────────────────────────────────────────────
# Mirrors the singleton pattern used by app/services/lora_transport.py so
# the rest of the app can share one buffer/state instance.
network_buffer_service = NetworkBufferService()

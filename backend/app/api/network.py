"""
NETRA — Network Status + Local Event Buffer API (Feature 3A + 3B)

Small, additive set of endpoints exposing:
  - network_buffer_service (Feature 3A): current network status can be
    toggled/observed and buffered Compact Events can be inspected during
    OFFLINE periods.
  - buffer_sync_service (Feature 3B): buffered Compact Events can be
    synced, in FIFO order, to the existing backend telemetry/event
    pipeline (TelemetryService.record_buffer_sync_event), and minimal sync
    status can be observed.

Scope: does NOT implement dashboard UI, real LoRa/hardware, new risk
algorithms, route changes, or safety-threshold changes.
"""

from typing import List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.schemas.compact_event import CompactEvent
from app.services.network_buffer import network_buffer_service, NetworkState
from app.services.buffer_sync import buffer_sync_service
from app.services.telemetry_service import telemetry_service

router = APIRouter(prefix="/api/network", tags=["Network Status"])


class NetworkStatusResponse(BaseModel):
    network_status: NetworkState
    buffered_count: int


class SetNetworkStatusRequest(BaseModel):
    network_status: NetworkState


class BufferResponse(BaseModel):
    events: List[CompactEvent]
    count: int


class SyncStatusResponse(BaseModel):
    buffered_count: int
    synced_count: int
    failed_count: int
    last_sync_time: Optional[str]


@router.get("/status", response_model=NetworkStatusResponse)
async def get_network_status():
    """Returns the current network status and how many events are buffered."""
    return NetworkStatusResponse(
        network_status=network_buffer_service.get_status(),
        buffered_count=network_buffer_service.buffer_size(),
    )


@router.post("/status", response_model=NetworkStatusResponse)
async def set_network_status(payload: SetNetworkStatusRequest):
    """
    Sets the current network status (ONLINE / OFFLINE).

    Switching to OFFLINE does not discard anything already buffered.
    Switching back to ONLINE does not auto-flush the buffer — buffered
    events remain available via GET /api/network/buffer (or /drain) for a
    future synchronization step.
    """
    new_state = network_buffer_service.set_status(payload.network_status)
    return NetworkStatusResponse(
        network_status=new_state,
        buffered_count=network_buffer_service.buffer_size(),
    )


@router.get("/buffer", response_model=BufferResponse)
async def get_buffered_events():
    """
    Returns all currently buffered Compact Events (oldest first, original
    order/timestamps preserved) WITHOUT clearing the buffer.
    """
    events = network_buffer_service.peek_buffered_events()
    return BufferResponse(events=events, count=len(events))


@router.post("/buffer/drain", response_model=BufferResponse)
async def drain_buffered_events():
    """
    Returns all currently buffered Compact Events (oldest first, original
    order/timestamps preserved) and clears the buffer.

    This is a hand-off point for a future synchronization step — it does
    NOT transmit the events anywhere itself.
    """
    events = network_buffer_service.drain_buffered_events()
    return BufferResponse(events=events, count=len(events))


@router.post("/sync", response_model=SyncStatusResponse)
async def sync_buffered_events():
    """
    Feature 3B — sends buffered Compact Events to the existing backend
    telemetry/event pipeline (SystemEvent audit log via TelemetryService),
    strictly in FIFO order.

    No-op (besides reporting current status) if the network is OFFLINE.
    An event is removed from the buffer only once the backend has accepted
    it; on the first failure, that event and everything still behind it
    stay buffered for the next retry.
    """
    status_ = buffer_sync_service.sync_pending_events(telemetry_service.record_buffer_sync_event)
    return SyncStatusResponse(
        buffered_count=status_.buffered_count,
        synced_count=status_.synced_count,
        failed_count=status_.failed_count,
        last_sync_time=status_.last_sync_time,
    )


@router.get("/sync/status", response_model=SyncStatusResponse)
async def get_sync_status():
    """Returns minimal sync status: buffered_count, synced_count, failed_count, last_sync_time."""
    status_ = buffer_sync_service.get_status()
    return SyncStatusResponse(
        buffered_count=status_.buffered_count,
        synced_count=status_.synced_count,
        failed_count=status_.failed_count,
        last_sync_time=status_.last_sync_time,
    )

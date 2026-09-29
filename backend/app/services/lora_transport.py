"""
NETRA — Safety Command LoRa Transport Layer (Phase 2D)

This module defines the SafetyCommand data contract and a LORA_SIMULATED transport
implementation for use during the SIH demo.

IMPORTANT — HONEST PROTOTYPE DECLARATION:
  Physical LoRa radio hardware has NOT been integrated into this demo.
  All commands produced here are marked  transport='LORA_SIMULATED'.
  The SafetyCommandTransport interface is designed so that a real LoRa gateway
  driver can replace LoraSimulatedTransport without changing the safety engine.

Transport status values:
  LORA_SIMULATED — current implementation (in-memory, no radio)
  LORA_READY     — future: LoRa module detected and ready
  OFFLINE        — future: LoRa unavailable, local ESP32 safety is the fallback

Command ID scheme:
  conflict_id  : shared by ALL commands for the same conflict event (e.g. "CONFLICT-001")
  command_id   : unique per vehicle command              (e.g. "CMD-001", "CMD-002")

Both vehicles receive identical safety_level, action, and reason but different
vehicle_id and command_id.
"""

from __future__ import annotations

import uuid
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# ── Data contract ─────────────────────────────────────────────────────────────

TransportStatus = str  # 'LORA_SIMULATED' | 'LORA_READY' | 'OFFLINE'

LORA_SIMULATED = 'LORA_SIMULATED'
LORA_READY     = 'LORA_READY'
OFFLINE        = 'OFFLINE'


@dataclass
class SafetyCommand:
    """
    Authoritative safety command issued to one vehicle.

    This is the canonical LoRa message contract.  The same dict structure is
    forwarded to the frontend via the WebSocket broadcast so the dashboard can
    display the exact command that was (would be) transmitted.
    """
    message_type:    str   = 'SAFETY_COMMAND'
    command_id:      str   = ''
    conflict_id:     str   = ''
    vehicle_id:      str   = ''
    safety_level:    str   = 'NORMAL'
    action:          str   = 'PROCEED'
    reason:          str   = ''
    timestamp:       str   = ''
    ttl_seconds:     int   = 5
    transport:       str   = LORA_SIMULATED
    # Prototype: target speed is a DEMO value, not a DGMS-approved operating limit.
    target_speed_kmh: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            'message_type':    self.message_type,
            'command_id':      self.command_id,
            'conflict_id':     self.conflict_id,
            'vehicle_id':      self.vehicle_id,
            'safety_level':    self.safety_level,
            'action':          self.action,
            'reason':          self.reason,
            'timestamp':       self.timestamp,
            'ttl_seconds':     self.ttl_seconds,
            'transport':       self.transport,
            'target_speed_kmh': self.target_speed_kmh,
        }


@dataclass
class CommandAck:
    """Acknowledgement record (simulated — real LoRa would populate this from a hardware ACK)."""
    command_id:  str
    vehicle_id:  str
    acked:       bool   = True   # simulated: always True
    ack_source:  str    = 'SIMULATED'
    ack_ts:      str    = ''


# ── Transport interface ────────────────────────────────────────────────────────

class SafetyCommandTransport:
    """Abstract interface for LoRa (or any future) vehicle communication transport."""

    def send_to_vehicle(
        self,
        vehicle_id: str,
        conflict_id: str,
        safety_level: str,
        action: str,
        reason: str,
        target_speed_kmh: Optional[float] = None,
        ttl_seconds: int = 5,
    ) -> SafetyCommand:
        raise NotImplementedError

    def send_to_both_vehicles(
        self,
        vehicle_ids: list[str],
        conflict_id: str,
        safety_level: str,
        action: str,
        reason: str,
        target_speed_kmh: Optional[float] = None,
        ttl_seconds: int = 5,
    ) -> list[SafetyCommand]:
        raise NotImplementedError

    def get_transport_status(self) -> TransportStatus:
        raise NotImplementedError

    def get_last_commands(self) -> list[SafetyCommand]:
        raise NotImplementedError


# ── LORA_SIMULATED implementation ─────────────────────────────────────────────

class LoraSimulatedTransport(SafetyCommandTransport):
    """
    Simulated LoRa transport for the NETRA SIH demo.

    Stores commands in memory and marks every packet transport='LORA_SIMULATED'.
    No actual radio transmission occurs.

    Thread-safe: uses a lock so the telemetry service and WebSocket broadcaster
    can read last_commands concurrently.
    """

    def __init__(self, max_history: int = 20) -> None:
        self._lock = threading.Lock()
        self._history: list[SafetyCommand] = []
        self._max_history = max_history
        self._cmd_counter = 0

    def _next_cmd_id(self) -> str:
        self._cmd_counter += 1
        return f'CMD-{self._cmd_counter:03d}'

    @staticmethod
    def _utc_now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def send_to_vehicle(
        self,
        vehicle_id: str,
        conflict_id: str,
        safety_level: str,
        action: str,
        reason: str,
        target_speed_kmh: Optional[float] = None,
        ttl_seconds: int = 5,
    ) -> SafetyCommand:
        with self._lock:
            cmd = SafetyCommand(
                command_id=self._next_cmd_id(),
                conflict_id=conflict_id,
                vehicle_id=vehicle_id,
                safety_level=safety_level,
                action=action,
                reason=reason,
                timestamp=self._utc_now(),
                ttl_seconds=ttl_seconds,
                transport=LORA_SIMULATED,
                target_speed_kmh=target_speed_kmh,
            )
            self._history.append(cmd)
            if len(self._history) > self._max_history:
                self._history.pop(0)
            return cmd

    def send_to_both_vehicles(
        self,
        vehicle_ids: list[str],
        conflict_id: str,
        safety_level: str,
        action: str,
        reason: str,
        target_speed_kmh: Optional[float] = None,
        ttl_seconds: int = 5,
    ) -> list[SafetyCommand]:
        """Send the same safety intent to all listed vehicles with the same conflict_id."""
        ts = self._utc_now()
        commands: list[SafetyCommand] = []
        with self._lock:
            for vid in vehicle_ids:
                cmd = SafetyCommand(
                    command_id=self._next_cmd_id(),
                    conflict_id=conflict_id,
                    vehicle_id=vid,
                    safety_level=safety_level,
                    action=action,
                    reason=reason,
                    timestamp=ts,  # same timestamp for all
                    ttl_seconds=ttl_seconds,
                    transport=LORA_SIMULATED,
                    target_speed_kmh=target_speed_kmh,
                )
                self._history.append(cmd)
                commands.append(cmd)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]
        return commands

    def get_transport_status(self) -> TransportStatus:
        return LORA_SIMULATED

    def get_last_commands(self) -> list[SafetyCommand]:
        with self._lock:
            return list(self._history)


# ── Module singleton ──────────────────────────────────────────────────────────

# The telemetry_service imports this singleton.
lora_transport = LoraSimulatedTransport()


# ── Conflict ID generator ─────────────────────────────────────────────────────

_conflict_counter = 0
_conflict_lock = threading.Lock()


def new_conflict_id() -> str:
    """Generate a human-readable conflict ID: CONFLICT-001, CONFLICT-002, …"""
    global _conflict_counter
    with _conflict_lock:
        _conflict_counter += 1
        return f'CONFLICT-{_conflict_counter:03d}'

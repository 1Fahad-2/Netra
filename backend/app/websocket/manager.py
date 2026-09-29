"""
MachineMind — WebSocket Connection Manager
Checkpoint 7 & 8: WebSocket Real-Time Distribution Infrastructure

Maintains active client connections and broadcasts committed telemetry envelopes.
Strict CP7 Delivery Invariant:
Only telemetry successfully committed to PostgreSQL may be broadcasted.
"""

import json
import logging
from typing import Set, Any, Dict
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and thread-safe / async broadcasting."""

    def __init__(self) -> None:
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        """Accepts a WebSocket connection and registers it in the active set."""
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(
            f"WebSocket client connected. Active connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Removes a WebSocket connection from the active set."""
        self.active_connections.discard(websocket)
        logger.info(
            f"WebSocket client disconnected. Remaining connections: {len(self.active_connections)}"
        )

    def active_connection_count(self) -> int:
        """Returns the number of currently active client connections."""
        return len(self.active_connections)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        Broadcasts a JSON-serializable dictionary to all active clients.
        Gracefully drops dead sockets.
        """
        if not self.active_connections:
            return

        dead_connections: Set[WebSocket] = set()
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception as exc:
                logger.warning(f"Error broadcasting to client, removing connection: {exc}")
                dead_connections.add(connection)

        for dead in dead_connections:
            self.disconnect(dead)

    async def broadcast_telemetry(self, telemetry_data: Dict[str, Any]) -> None:
        """
        Broadcasts a committed VehicleTelemetry event inside the standard envelope:
        {
            "type": "telemetry",
            "data": <VehicleTelemetry>
        }
        """
        envelope = {
            "type": "telemetry",
            "data": telemetry_data,
        }
        await self.broadcast(envelope)

    async def broadcast_alert(self, alert_data: Dict[str, Any]) -> None:
        """
        Broadcast a newly created safety alert.
        Envelope format:
        {
            "type": "alert",
            "data": <alert dict>
        }
        """
        envelope = {
            "type": "alert",
            "data": alert_data,
        }
        await self.broadcast(envelope)
        



# Singleton instance shared across FastAPI routers
ws_manager = ConnectionManager()

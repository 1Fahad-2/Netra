"""
MachineMind — WebSocket Live Telemetry Stream Endpoint
Checkpoint 7 & 8: WebSocket Real-Time Distribution

Endpoint:
/ws/telemetry — Emits real-time committed telemetry events to connected dashboards.
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.websocket.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/telemetry")
async def websocket_telemetry_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for live telemetry distribution.
    
    Upon connection:
    - Accepts connection and registers with ConnectionManager.
    - Emits connection_ack envelope.
    - Keeps connection alive and handles incoming ping/pong requests.
    - Cleanly unregisters upon disconnect.
    """
    await ws_manager.connect(websocket)
    try:
        # Initial greeting and stream metadata
        await websocket.send_json({
            "type": "connection_ack",
            "message": "Connected to MachineMind live telemetry stream",
            "vehicle_ids": ["HEMM-01", "HEMM-02"],
        })

        while True:
            # Await client keep-alive or ping messages
            text_data = await websocket.receive_text()
            try:
                msg = json.loads(text_data)
                if isinstance(msg, dict) and msg.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})
            except Exception:
                if text_data.strip().lower() == "ping":
                    await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.warning(f"WebSocket connection error: {exc}")
        ws_manager.disconnect(websocket)

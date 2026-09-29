"""
MachineMind — Telemetry Ingestion & Retrieval API
Checkpoint 6: Telemetry API Persistence Integration

Operates on the agreed Common Telemetry Contract (src/types/contract.ts).
All ingested telemetry is persisted directly to PostgreSQL via TelemetryService.
"""

from typing import List
from app.schemas.hardware_telemetry import HardwareTelemetry
from app.schemas.telemetry import (
    VehicleTelemetry,
    TelemetryIngestResponse,
    Position3D,
    SensorHealthRecord,
    VisibilityCondition,
    NetworkStatus,
    DataMode,
)

from fastapi import APIRouter, HTTPException, Query, status, Request, Header
import os
from app.schemas.telemetry import VehicleTelemetry, TelemetryIngestResponse
from app.schemas.compact_event import CompactEvent, to_compact_event
from app.services.telemetry_service import telemetry_service
from app.services.oncoming_predictor import predict_oncoming
from app.services.lora_transport import lora_transport, new_conflict_id
from app.websocket.manager import ws_manager
from app.services.route_projector import project_gps_to_route
from app.services.network_buffer import network_buffer_service

router = APIRouter(prefix="/api/telemetry", tags=["Telemetry"])

# Tracks the active conflict_id so both vehicles get the same one
_active_conflict_id: str | None = None


async def _run_oncoming_prediction_and_broadcast() -> None:
    """
    After any telemetry ingestion: fetch both vehicles' latest telemetry,
    run the backend oncoming predictor, and if a prediction fires:
      1. Issue a SAFETY_COMMAND to both vehicles via LORA_SIMULATED transport.
      2. Broadcast the prediction event and commands over WebSocket.

    This is the authoritative backend prediction path.
    The frontend does NOT independently predict conflicts — it reads what the backend
    broadcasts here.

    Source label: TELEMETRY_PREDICTION (never claims physical sensor detection).
    """
    global _active_conflict_id

    t1 = telemetry_service.get_latest_telemetry('HEMM-01')
    t2 = telemetry_service.get_latest_telemetry('HEMM-02')
    if t1 is None or t2 is None:
        return

    prediction = predict_oncoming(t1, t2)

    if prediction.predicted:
        # Re-use an existing conflict_id if one is already active (avoids generating
        # a new ID on every 400 ms tick).
        if _active_conflict_id is None:
            _active_conflict_id = new_conflict_id()
        conflict_id = _active_conflict_id

        # Issue one SAFETY_COMMAND to BOTH vehicles with the same conflict_id.
        commands = lora_transport.send_to_both_vehicles(
            vehicle_ids=['HEMM-01', 'HEMM-02'],
            conflict_id=conflict_id,
            safety_level='HIGH',
            action='REDUCE_SPEED',
            reason=prediction.reason,
            target_speed_kmh=None,  # prototype: no DGMS-certified speed
            ttl_seconds=5,
        )

        # Broadcast the prediction event so the frontend dashboard can display it.
        prediction_payload = {
            'type': 'oncoming_prediction',
            'predicted': True,
            'event_id': prediction.event_id,
            'conflict_id': conflict_id,
            'oncoming_vehicle_id': prediction.oncoming_vehicle_id,
            'at_blind_curve_id': prediction.at_blind_curve_id,
            'estimated_ttc_s': prediction.estimated_ttc_s,
            'combined_closing_speed_ms': prediction.combined_closing_speed_ms,
            'route_separation_m': prediction.route_separation_m,
            'detection_source': prediction.detection_source,
            'confidence': prediction.confidence,
            'reason': prediction.reason,
            'transport_status': lora_transport.get_transport_status(),
            'commands': [c.to_dict() for c in commands],
        }
        await ws_manager.broadcast(prediction_payload)
    else:
        # No active prediction — clear the conflict ID so a fresh one is generated next time.
        _active_conflict_id = None
        # Broadcast a cleared state so the frontend can remove the prediction badge.
        await ws_manager.broadcast({
            'type': 'oncoming_prediction',
            'predicted': False,
            'reason': prediction.reason,
        })



@router.post("", response_model=TelemetryIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_telemetry(telemetry: VehicleTelemetry):
    """
    Ingests vehicle telemetry matching the Common Telemetry Contract and persists it to PostgreSQL.
    
    Strict Delivery Semantics (CP7 & CP8):
    1. Validate schema & prototype registry.
    2. Persist to PostgreSQL via telemetry_service.record_telemetry().
    3. Transaction commits to PostgreSQL.
    4. Only AFTER successful database commit, broadcast over WebSocket.
    5. If persistence fails (HTTP 503), NO broadcast occurs.
    """


    clean_id = telemetry.vehicle_id.upper()
    if not telemetry_service.get_vehicle(clean_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot ingest telemetry: vehicle '{telemetry.vehicle_id}' is not a registered prototype. Registered prototypes are HEMM-01 and HEMM-02.",
        )

    # 1. Persist strictly to PostgreSQL (commits transaction)
    alert_payload = telemetry_service.record_telemetry(telemetry)

    # 2. Broadcast committed telemetry to WebSocket subscribers
    telemetry_dict = telemetry.model_dump(mode="json")
    await ws_manager.broadcast_telemetry(telemetry_dict)
    # 3. If an alert was created, broadcast it via WebSocket
    if alert_payload:
        await ws_manager.broadcast_alert(alert_payload)
    # 4. Backend oncoming prediction (authoritative — not the frontend)
    await _run_oncoming_prediction_and_broadcast()

    return TelemetryIngestResponse(
        status="success",
        message="Telemetry persisted in PostgreSQL and broadcasted via WebSocket (CP8)",
        vehicle_id=telemetry.vehicle_id,
        timestamp=telemetry.timestamp,
        risk_level=telemetry.risk_level,
        risk_score=telemetry.risk_score,
        object_distance=telemetry.object_distance,
        relative_speed=telemetry.relative_speed,
        ttc=telemetry.ttc,
        recommended_action=telemetry.recommended_action,
    )

# ---------------------------------------------------------------------------
# Hardware telemetry ingestion endpoint (thin adapter)
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Hardware telemetry ingestion endpoint (thin adapter)
# ---------------------------------------------------------------------------

@router.post("/hardware", response_model=TelemetryIngestResponse, status_code=status.HTTP_201_CREATED)
async def ingest_hardware_telemetry(hw: HardwareTelemetry, request: Request, x_dev_source: str = Header(None)):
    """Accept raw hardware telemetry, enrich to full VehicleTelemetry, and process.
    X-Dev-Source header can be 'DUMMY' in development mode only.
    """
    # Verify vehicle registration
    vehicle = telemetry_service.get_vehicle(hw.vehicle_id.upper())
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cannot ingest hardware telemetry: vehicle '{hw.vehicle_id}' is not a registered prototype.",
        )

    # Determine data source classification
    env = os.getenv("ENVIRONMENT", "production")
    if env == "development" and (x_dev_source or "").upper() == "DUMMY":
        data_source = "DUMMY"
    else:
        data_source = "HARDWARE"

    # Build full VehicleTelemetry using hardware fields and safe defaults
    position = Position3D(latitude=hw.latitude, longitude=hw.longitude, altitude=hw.altitude)
    sensor_health = SensorHealthRecord(
        radar=hw.sensor_status,
        thermal=hw.sensor_status,
        gnss=hw.sensor_status,
        imu=hw.sensor_status,
    )
    # ── Route position (Phase 2E) ──────────────────────────────────────────────
    # Project the hardware GPS coordinate onto the frozen haul-road corridor.
    # If the device is off-route (> MAX_OFF_ROUTE_M) the raw GPS is preserved
    # and route_distance falls back to 0.0 so existing V2V logic is not misled.
    projection = project_gps_to_route(hw.latitude, hw.longitude)
    computed_route_distance = projection.route_distance_m if projection.on_route else 0.0
    computed_section_id     = projection.section_id if projection.on_route else "UNKNOWN"

    vt = VehicleTelemetry(
        gps_accuracy=hw.gps_accuracy,
        sensor_status=hw.sensor_status,
        vehicle_id=hw.vehicle_id,
        vehicle_type=vehicle.vehicle_type,
        timestamp=hw.timestamp,
        position=position,
        heading=hw.heading,
        speed=hw.speed,
        visibility_condition=VisibilityCondition.UNKNOWN,
        object_detected=hw.obstacle_distance is not None,
        object_type=None,
        object_distance=hw.obstacle_distance,
        relative_speed=None,
        ttc=None,
        risk_score=None,
        risk_level=None,
        recommended_action=None,
        sensor_health=sensor_health,
        network_status=NetworkStatus.ONLINE,
        data_mode=DataMode.PHYSICAL_TESTBED,
        source_metadata="HARDWARE",
        data_source=data_source,
        route_distance=computed_route_distance,
        section_id=computed_section_id,
    )

    # Persist and broadcast using existing service pipeline
    alert_payload = telemetry_service.record_telemetry(vt)
    telemetry_dict = vt.model_dump(mode="json")
    await ws_manager.broadcast_telemetry(telemetry_dict)
    if alert_payload:
        await ws_manager.broadcast_alert(alert_payload)
    # Backend oncoming prediction (hardware path also participates)
    await _run_oncoming_prediction_and_broadcast()

    return TelemetryIngestResponse(
        status="success",
        message=f"Hardware telemetry persisted and broadcasted ({data_source})",
        vehicle_id=vt.vehicle_id,
        timestamp=vt.timestamp,
        risk_level=vt.risk_level,
        risk_score=vt.risk_score,
        object_distance=vt.object_distance,
        relative_speed=vt.relative_speed,
        ttc=vt.ttc,
        recommended_action=vt.recommended_action,
        risk_reason=vt.risk_reason,
    )


@router.get("/{vehicle_id}/history", response_model=List[VehicleTelemetry])
async def get_telemetry_history(
    vehicle_id: str,
    limit: int = Query(
        default=100,
        ge=1,
        le=1000,
        description="Max number of historical telemetry records to return (ordered newest first)",
    ),
):
    """
    Returns chronological telemetry history for the specified vehicle from PostgreSQL (newest first).
    Ordering: timestamp DESC, id DESC.
    """
    clean_id = vehicle_id.upper()
    if not telemetry_service.get_vehicle(clean_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
        )

    return telemetry_service.get_telemetry_history(clean_id, limit=limit)


@router.get("/{vehicle_id}/compact", response_model=CompactEvent)
async def get_latest_compact_event(vehicle_id: str):
    """
    Returns the latest telemetry for the specified vehicle adapted into the
    Compact Event contract (small, LoRa-class wire format).

    This is a pure read-time adapter over the existing telemetry pipeline —
    it does not change how telemetry is ingested, persisted, or broadcast,
    and it does not alter any risk/safety computation.

    Feature 3A: the generated Compact Event is also handed to the
    network_buffer_service, which either lets it pass straight through
    (network ONLINE — no change to this response) or buffers it locally
    (network OFFLINE) so it is not lost while connectivity is down. This
    endpoint's response is identical either way.
    """
    clean_id = vehicle_id.upper()
    if not telemetry_service.get_vehicle(clean_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
        )

    telemetry = telemetry_service.get_latest_telemetry(clean_id)
    if not telemetry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No telemetry has been recorded yet for vehicle '{vehicle_id}'.",
        )

    compact_event = to_compact_event(telemetry)
    network_buffer_service.submit_event(compact_event)
    return compact_event


@router.get("/{vehicle_id}", response_model=VehicleTelemetry)
async def get_latest_telemetry(vehicle_id: str):
    """
    Returns the latest telemetry snapshot from PostgreSQL for the specified vehicle.
    Ordering: timestamp DESC, id DESC.
    """
    clean_id = vehicle_id.upper()
    if not telemetry_service.get_vehicle(clean_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
        )

    telemetry = telemetry_service.get_latest_telemetry(clean_id)
    if not telemetry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No telemetry has been recorded yet for vehicle '{vehicle_id}'.",
        )

    return telemetry

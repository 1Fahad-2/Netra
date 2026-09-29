"""
MachineMind — Telemetry & Vehicle Service
Checkpoint 6: Telemetry API Persistence Integration

Architecture:
API Route -> TelemetryService -> TelemetryRepository -> SQLAlchemy 2.x -> PostgreSQL
"""

from datetime import datetime, timezone
from typing import List, Optional, Dict
import uuid
import logging
from app.services.v2v_engine import v2v_engine, V2VAssessment
from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.database.models import (
    Vehicle,
    TelemetryEvent,
    Alert,
    SensorHealth,
    SystemEvent,
    utc_now,
)
from app.database.repositories import (
    VehicleRepository,
    TelemetryRepository,
    AlertRepository,
    SensorHealthRepository,
    SystemEventRepository,
)
from app.schemas.vehicle import VehicleResponse
from app.schemas.telemetry import (
    VehicleTelemetry,
    Position3D,
    SensorHealthRecord,
    SensorState,
    RiskLevel,
    RecommendedAction,
    VisibilityCondition,
    NetworkStatus,
    DataMode,
)
from app.schemas.alert import AlertItem

logger = logging.getLogger(__name__)

# Fallback prototype registry — HEMM-01 is LEAD, HEMM-02 is TRAILING
_DEFAULT_PROTOTYPES: Dict[str, VehicleResponse] = {
    "HEMM-01": VehicleResponse(
        vehicle_id="HEMM-01",
        vehicle_type="100T DUMPER (LEAD)",
        status="ACTIVE",
        data_provenance="SIMULATED",
        registered_at="2026-09-11T00:00:00Z",
    ),
    "HEMM-02": VehicleResponse(
        vehicle_id="HEMM-02",
        vehicle_type="100T DUMPER (TRAILING)",
        status="ACTIVE",
        data_provenance="SIMULATED",
        registered_at="2026-09-11T00:00:00Z",
    ),
}


def _parse_utc_datetime(dt_val: str | datetime) -> datetime:
    """Safely converts string or datetime into UTC timezone-aware datetime."""
    if isinstance(dt_val, datetime):
        return dt_val if dt_val.tzinfo else dt_val.replace(tzinfo=timezone.utc)
    try:
        clean_str = dt_val.replace("Z", "+00:00")
        dt = datetime.fromisoformat(clean_str)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return utc_now()


def _model_to_schema(event: TelemetryEvent, vehicle_type: str) -> VehicleTelemetry:
    """Converts a persisted TelemetryEvent SQLAlchemy model back to VehicleTelemetry schema."""
    ts_str = event.timestamp.isoformat()
    if event.timestamp.tzinfo is None:
        ts_str += "Z"

    return VehicleTelemetry(
        vehicle_id=event.vehicle_id,
        vehicle_type=vehicle_type,
        timestamp=ts_str,
        position=Position3D(
            latitude=event.latitude,
            longitude=event.longitude,
            altitude=event.altitude,
        ),
        heading=event.heading,
        speed=event.speed,
        visibility_condition=VisibilityCondition(event.visibility_condition),
        object_detected=event.object_detected,
        object_type=event.object_type,
        object_distance=event.object_distance,
        relative_speed=event.relative_speed,
        ttc=event.ttc,
        risk_score=event.risk_score,
        risk_level=RiskLevel(event.risk_level),
        recommended_action=RecommendedAction(event.recommended_action),
        sensor_health=SensorHealthRecord(
            radar=SensorState(event.sensor_radar),
            thermal=SensorState(event.sensor_thermal),
            gnss=SensorState(event.sensor_gnss),
            imu=SensorState(event.sensor_imu),
        ),
        network_status=NetworkStatus(event.network_status),
        data_mode=DataMode(event.data_mode),
        route_distance=event.route_distance,
        section_id=event.section_id,
        source_metadata=event.source_metadata,
    )


class TelemetryService:
    """
    Business service layer coordinating database repositories.
    Guarantees strict persistence integrity for Checkpoint 6.
    """

    def get_vehicles(self) -> List[VehicleResponse]:
        """Returns the list of registered prototype vehicles (strictly HEMM-01 and HEMM-02)."""
        try:
            with SessionLocal() as db:
                vehicles = VehicleRepository.get_all(db)
                if not vehicles:
                    vehicles = VehicleRepository.seed_prototypes(db)

                return [
                    VehicleResponse(
                        vehicle_id=v.vehicle_id,
                        vehicle_type=v.vehicle_type,
                        status=v.status,
                        data_provenance=v.data_provenance,
                        registered_at=v.registered_at.isoformat() if v.registered_at else "2026-09-11T00:00:00Z",
                    )
                    for v in vehicles
                ]
        except Exception as exc:
            logger.warning(f"Database query failed, serving registered prototypes: {exc}")
            return list(_DEFAULT_PROTOTYPES.values())

    def get_vehicle(self, vehicle_id: str) -> Optional[VehicleResponse]:
        """Returns vehicle metadata if registered in the database, else None."""
        clean_id = vehicle_id.upper()
        # Strictly reject any vehicle outside the registered prototypes
        if clean_id not in ("HEMM-01", "HEMM-02"):
            return None

        try:
            with SessionLocal() as db:
                v = VehicleRepository.get_by_id(db, clean_id)
                if v:
                    return VehicleResponse(
                        vehicle_id=v.vehicle_id,
                        vehicle_type=v.vehicle_type,
                        status=v.status,
                        data_provenance=v.data_provenance,
                        registered_at=v.registered_at.isoformat() if v.registered_at else "2026-09-11T00:00:00Z",
                    )
        except Exception as exc:
            logger.warning(f"Database query failed, checking fallback prototype registry: {exc}")

        return _DEFAULT_PROTOTYPES.get(clean_id)

    def record_telemetry(self, telemetry: VehicleTelemetry) -> Optional[Dict]:
        """
        Persists a new append-only telemetry record in PostgreSQL,
        updates sensor health diagnostic log, and maintains active safety alerts.

        Strict CP6 Rule: If PostgreSQL persistence fails, this method raises HTTPException(503)
        and NEVER returns false success.
        """
        clean_id = telemetry.vehicle_id.upper()
        if clean_id not in ("HEMM-01", "HEMM-02"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Cannot ingest telemetry: vehicle '{telemetry.vehicle_id}' is not a registered prototype. Registered prototypes are HEMM-01 and HEMM-02.",
            )

        ts = _parse_utc_datetime(telemetry.timestamp)

        try:
            with SessionLocal() as db:
                # 1. Verify vehicle exists in DB (or seed prototypes if fresh DB)
                vehicle = VehicleRepository.get_by_id(db, clean_id)
                if not vehicle:
                    seeded = VehicleRepository.seed_prototypes(db)
                    vehicle = next((v for v in seeded if v.vehicle_id == clean_id), None)
                    if not vehicle:
                        raise HTTPException(
                            status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Vehicle '{telemetry.vehicle_id}' is not registered in the database.",
                        )

                # 2. Append-only telemetry persistence
                event = TelemetryEvent(
                    vehicle_id=clean_id,
                    timestamp=ts,
                    latitude=telemetry.position.latitude,
                    longitude=telemetry.position.longitude,
                    altitude=telemetry.position.altitude,
                    heading=telemetry.heading,
                    speed=telemetry.speed,
                    gps_accuracy=telemetry.gps_accuracy,
                    sensor_status=str(telemetry.sensor_status) if telemetry.sensor_status is not None else None,
                    data_source=telemetry.data_source,
                    visibility_condition=str(telemetry.visibility_condition),
                    object_detected=telemetry.object_detected,
                    object_type=telemetry.object_type,
                    object_distance=telemetry.object_distance,
                    relative_speed=telemetry.relative_speed,
                    ttc=telemetry.ttc,
                    risk_score=telemetry.risk_score,
                    risk_level=str(telemetry.risk_level),
                    recommended_action=str(telemetry.recommended_action),
                    sensor_radar=str(telemetry.sensor_health.radar),
                    sensor_thermal=str(telemetry.sensor_health.thermal),
                    sensor_gnss=str(telemetry.sensor_health.gnss),
                    sensor_imu=str(telemetry.sensor_health.imu),
                    network_status=str(telemetry.network_status),
                    data_mode=str(telemetry.data_mode),
                    source_metadata=telemetry.source_metadata,
                    route_distance=telemetry.route_distance,
                    section_id=telemetry.section_id,
                )
                # 2. Append-only telemetry persistence via TelemetryRepository
                # Telemetry will be persisted after V2V assessment

                # 3. Sensor health diagnostics snapshot via SensorHealthRepository
                sensor_record = SensorHealth(
                    vehicle_id=clean_id,
                    timestamp=ts,
                    radar=str(telemetry.sensor_health.radar),
                    thermal=str(telemetry.sensor_health.thermal),
                    gnss=str(telemetry.sensor_health.gnss),
                    imu=str(telemetry.sensor_health.imu),
                )
                SensorHealthRepository.create(db, sensor_record)                # 4. Update safety alert ledger via AlertRepository
                # 4. Compute V2V assessment and override safety fields
                other_id = "HEMM-02" if clean_id == "HEMM-01" else "HEMM-01"
                other_event = TelemetryRepository.get_latest(db, other_id)
                if other_event:
                    other_vehicle = VehicleRepository.get_by_id(db, other_id)
                    other_type = other_vehicle.vehicle_type if other_vehicle else "UNKNOWN"
                    other_schema = _model_to_schema(other_event, other_type)
                    assessment = v2v_engine.assess(telemetry, other_schema)
                else:
                    assessment = V2VAssessment(
                        risk_level=RiskLevel.NORMAL,
                        recommended_action=RecommendedAction.PROCEED,
                        distance_m=None,
                        closing_speed=None,
                        ttc=None,
                        relative_direction="UNKNOWN",
                        same_route=False,
                        telemetry_fresh=True,
                        is_new_alert=False,
                    )
                # Override client‑provided safety fields with backend‑derived values
                telemetry.risk_level = assessment.risk_level
                telemetry.recommended_action = assessment.recommended_action
                telemetry.object_distance = assessment.distance_m
                telemetry.relative_speed = assessment.closing_speed
                telemetry.ttc = assessment.ttc
                telemetry.risk_score = assessment.risk_score
                telemetry.risk_reason = f"V2V assessment: distance={assessment.distance_m}, ttc={assessment.ttc}, risk={assessment.risk_level}"
                if assessment.distance_m is not None:
                    telemetry.object_detected = True
                    telemetry.object_type = other_id


                # Rebuild telemetry event with updated safety fields
                event = TelemetryEvent(
                    vehicle_id=clean_id,
                    timestamp=ts,
                    latitude=telemetry.position.latitude,
                    longitude=telemetry.position.longitude,
                    altitude=telemetry.position.altitude,
                    heading=telemetry.heading,
                    speed=telemetry.speed,
                    gps_accuracy=telemetry.gps_accuracy,
                    sensor_status=str(telemetry.sensor_status) if telemetry.sensor_status is not None else None,
                    data_source=telemetry.data_source,
                    visibility_condition=str(telemetry.visibility_condition),
                    object_detected=telemetry.object_detected,
                    object_type=telemetry.object_type,
                    object_distance=telemetry.object_distance,
                    relative_speed=telemetry.relative_speed,
                    ttc=telemetry.ttc,
                    risk_score=telemetry.risk_score,
                    risk_level=str(telemetry.risk_level),
                    recommended_action=str(telemetry.recommended_action),
                    sensor_radar=str(telemetry.sensor_health.radar),
                    sensor_thermal=str(telemetry.sensor_health.thermal),
                    sensor_gnss=str(telemetry.sensor_health.gnss),
                    sensor_imu=str(telemetry.sensor_health.imu),
                    network_status=str(telemetry.network_status),
                    data_mode=str(telemetry.data_mode),
                    source_metadata=telemetry.source_metadata,
                    route_distance=telemetry.route_distance,
                    section_id=telemetry.section_id,
                )
                TelemetryRepository.append(db, event)

                # 5. Alert handling – only V2V alerts
                alert_payload = None
                if assessment.is_new_alert:
                    dist_str = f"{assessment.distance_m:.0f}m" if assessment.distance_m is not None else "CRITICAL"
                    ttc_str = f"{assessment.ttc:.1f}s" if assessment.ttc is not None else "IMMINENT"
                    severity = "CRITICAL" if assessment.risk_level == RiskLevel.CRITICAL else "WARNING"
                    title = "CRITICAL COLLISION PROXIMITY HAZARD" if severity == "CRITICAL" else "COLLISION PROXIMITY ADVISORY"
                    reason = f"Closing headway to {telemetry.object_type or 'lead vehicle'} ({dist_str}, TTC {ttc_str}). Recommended action: {telemetry.recommended_action}."
                    alert = Alert(
                        id=f"ALT-{uuid.uuid4().hex[:8].upper()}",
                        vehicle_id=clean_id,
                        severity=severity,
                        title=title,
                        reason=reason,
                        timestamp=ts,
                        relative_time="JUST NOW",
                        latitude=telemetry.position.latitude,
                        longitude=telemetry.position.longitude,
                        status="ACTIVE",
                    )
                    AlertRepository.create(db, alert)
                    alert_payload = {
                        "id": alert.id,
                        "vehicle_id": alert.vehicle_id,
                        "severity": alert.severity,
                        "title": alert.title,
                        "reason": alert.reason,
                        "timestamp": alert.timestamp.isoformat(),
                        "relative_time": alert.relative_time,
                        "lat": alert.latitude,
                        "lon": alert.longitude,
                    }
                elif assessment.risk_level == RiskLevel.NORMAL:
                    stmt = (
                        select(Alert)
                        .where(
                            Alert.vehicle_id == clean_id,
                            Alert.status == "ACTIVE",
                            Alert.title.ilike("%COLLISION PROXIMITY%"),
                        )
                    )
                    v2v_alerts = list(db.scalars(stmt).all())
                    for a in v2v_alerts:
                        a.status = "RESOLVED"
                    if v2v_alerts:
                        db.commit()
                return alert_payload

        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Database persistence failure in record_telemetry: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database persistence unavailable: {str(exc)}",
            )

    def get_latest_telemetry(self, vehicle_id: str) -> Optional[VehicleTelemetry]:
        """
        Returns latest telemetry for a vehicle reconstructed from PostgreSQL.
        Ordering is strictly deterministic: timestamp DESC, id DESC.
        """
        clean_id = vehicle_id.upper()
        if clean_id not in ("HEMM-01", "HEMM-02"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
            )

        try:
            with SessionLocal() as db:
                event = TelemetryRepository.get_latest(db, clean_id)
                if not event:
                    return None

                veh = VehicleRepository.get_by_id(db, clean_id)
                veh_type = veh.vehicle_type if veh else "100T DUMPER"

                return _model_to_schema(event, veh_type)
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Database query failure in get_latest_telemetry: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database query unavailable: {str(exc)}",
            )

    def get_telemetry_history(
        self, vehicle_id: str, limit: int = 100
    ) -> List[VehicleTelemetry]:
        """
        Returns chronological telemetry history for a vehicle reconstructed from PostgreSQL.
        Ordering is strictly deterministic: timestamp DESC, id DESC (newest first).
        """
        clean_id = vehicle_id.upper()
        if clean_id not in ("HEMM-01", "HEMM-02"):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
            )

        try:
            with SessionLocal() as db:
                events = TelemetryRepository.get_history(db, clean_id, limit=limit)
                if not events:
                    return []

                veh = VehicleRepository.get_by_id(db, clean_id)
                veh_type = veh.vehicle_type if veh else "100T DUMPER"

                return [_model_to_schema(e, veh_type) for e in events]
        except HTTPException:
            raise
        except Exception as exc:
            logger.error(f"Database query failure in get_telemetry_history: {exc}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Database query unavailable: {str(exc)}",
            )

    def record_buffer_sync_event(self, compact_event) -> bool:
        """
        Feature 3B — Buffered Event Sync.

        Persists the arrival of one previously-buffered Compact Event as a
        BUFFER_SYNC system-audit record, reusing the EXISTING SystemEvent
        table/repository (already scaffolded for this purpose — see
        SystemEvent's docstring) rather than introducing any new
        persistence path or duplicate telemetry pipeline.

        Preserves the event's original vehicle_id and timestamp exactly as
        buffered. Returns True only on confirmed backend acceptance (a
        committed row); NEVER raises and NEVER returns True on failure, so
        the caller (BufferSyncService) can safely keep the event queued for
        retry instead of losing it or falsely reporting success.
        """
        clean_id = compact_event.vehicle_id.upper()
        ts = _parse_utc_datetime(compact_event.timestamp)
        try:
            with SessionLocal() as db:
                event = SystemEvent(
                    vehicle_id=clean_id if clean_id in ("HEMM-01", "HEMM-02") else None,
                    event_type="BUFFER_SYNC",
                    message=(
                        f"Buffered Compact Event synced for {compact_event.vehicle_id} "
                        f"(original timestamp {compact_event.timestamp})"
                    ),
                    timestamp=ts,
                    event_metadata=compact_event.model_dump(mode="json"),
                )
                SystemEventRepository.create(db, event)
                return True
        except Exception as exc:
            logger.error(f"Buffer sync persistence failure for {compact_event.vehicle_id}: {exc}")
            return False

    def get_alerts(self) -> List[AlertItem]:
        """Returns currently active safety alerts persisted in PostgreSQL."""
        try:
            with SessionLocal() as db:
                alerts = AlertRepository.get_active(db)
                return [
                    AlertItem(
                        id=a.id,
                        vehicle_id=a.vehicle_id,
                        severity=a.severity,
                        title=a.title,
                        reason=a.reason,
                        timestamp=a.timestamp.isoformat(),
                        relative_time=a.relative_time or "JUST NOW",
                        lat=a.latitude,
                        lon=a.longitude,
                    )
                    for a in alerts
                ]
        except Exception as exc:
            logger.warning(f"Database query for alerts failed: {exc}")
            return []


# Global singleton service instance
telemetry_service = TelemetryService()

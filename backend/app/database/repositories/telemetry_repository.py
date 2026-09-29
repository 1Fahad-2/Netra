"""
MachineMind — Telemetry Repository
Encapsulates append-only persistence and retrieval for vehicle telemetry events.
Historical telemetry records are NEVER updated or overwritten.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func

from app.database.models import TelemetryEvent


class TelemetryRepository:
    """Data access repository for append-only TelemetryEvent records."""

    @staticmethod
    def append(db: Session, event: TelemetryEvent) -> TelemetryEvent:
        """
        Appends a new telemetry event to the historical ledger.
        Strictly append-only: does not modify any existing telemetry record.
        """
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    @staticmethod
    def get_latest(db: Session, vehicle_id: str) -> Optional[TelemetryEvent]:
        """Returns the most recent telemetry event recorded for the vehicle."""
        stmt = (
            select(TelemetryEvent)
            .where(TelemetryEvent.vehicle_id == vehicle_id)
            .order_by(TelemetryEvent.timestamp.desc(), TelemetryEvent.id.desc())
        )
        return db.scalars(stmt).first()

    @staticmethod
    def get_history(
        db: Session, vehicle_id: str, limit: int = 100
    ) -> List[TelemetryEvent]:
        """Returns chronological telemetry history for a vehicle (newest first)."""
        stmt = (
            select(TelemetryEvent)
            .where(TelemetryEvent.vehicle_id == vehicle_id)
            .order_by(TelemetryEvent.timestamp.desc(), TelemetryEvent.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    @staticmethod
    def count(db: Session, vehicle_id: Optional[str] = None) -> int:
        """Returns the total number of telemetry records, optionally filtered by vehicle."""
        stmt = select(func.count(TelemetryEvent.id))
        if vehicle_id:
            stmt = stmt.where(TelemetryEvent.vehicle_id == vehicle_id)
        result = db.scalar(stmt)
        return int(result or 0)

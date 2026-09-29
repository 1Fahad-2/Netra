"""
MachineMind — Sensor Health Repository
Encapsulates persistence for hardware sensor health diagnostic snapshots.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database.models import SensorHealth


class SensorHealthRepository:
    """Data access repository for SensorHealth records."""

    @staticmethod
    def create(db: Session, record: SensorHealth) -> SensorHealth:
        """Persists a sensor health snapshot."""
        db.add(record)
        db.commit()
        db.refresh(record)
        return record

    @staticmethod
    def get_latest_for_vehicle(db: Session, vehicle_id: str) -> Optional[SensorHealth]:
        """Returns the most recent sensor health record for a vehicle."""
        stmt = (
            select(SensorHealth)
            .where(SensorHealth.vehicle_id == vehicle_id)
            .order_by(SensorHealth.timestamp.desc(), SensorHealth.id.desc())
        )
        return db.scalars(stmt).first()

    @staticmethod
    def get_history_for_vehicle(
        db: Session, vehicle_id: str, limit: int = 50
    ) -> List[SensorHealth]:
        """Returns chronological history of sensor health snapshots."""
        stmt = (
            select(SensorHealth)
            .where(SensorHealth.vehicle_id == vehicle_id)
            .order_by(SensorHealth.timestamp.desc(), SensorHealth.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

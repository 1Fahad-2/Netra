"""
MachineMind — Alert Repository
Encapsulates persistence and query operations for safety and collision alerts.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from app.database.models import Alert


class AlertRepository:
    """Data access repository for Alert records."""

    @staticmethod
    def create(db: Session, alert: Alert) -> Alert:
        """Persists a new safety alert record."""
        db.add(alert)
        db.commit()
        db.refresh(alert)
        return alert

    @staticmethod
    def get_active(db: Session, limit: int = 50) -> List[Alert]:
        """Returns currently active safety alerts (newest first)."""
        stmt = (
            select(Alert)
            .where(Alert.status == "ACTIVE")
            .order_by(Alert.timestamp.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    @staticmethod
    def get_by_vehicle(db: Session, vehicle_id: str, limit: int = 50) -> List[Alert]:
        """Returns alerts for a specific vehicle."""
        stmt = (
            select(Alert)
            .where(Alert.vehicle_id == vehicle_id)
            .order_by(Alert.timestamp.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    @staticmethod
    def resolve_active_for_vehicle(db: Session, vehicle_id: str) -> None:
        """Marks active alerts for a vehicle as RESOLVED when risk subsides."""
        stmt = (
            update(Alert)
            .where(Alert.vehicle_id == vehicle_id, Alert.status == "ACTIVE")
            .values(status="RESOLVED")
        )
        db.execute(stmt)
        db.commit()

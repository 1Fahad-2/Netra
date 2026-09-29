"""
MachineMind — System Event Repository
Encapsulates persistence and retrieval for edge/fleet operational audit events.
"""

from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database.models import SystemEvent


class SystemEventRepository:
    """Data access repository for operational SystemEvent audit records."""

    @staticmethod
    def create(db: Session, event: SystemEvent) -> SystemEvent:
        """Persists an operational system event."""
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    @staticmethod
    def get_recent(db: Session, limit: int = 50) -> List[SystemEvent]:
        """Returns recent system events ordered newest first."""
        stmt = (
            select(SystemEvent)
            .order_by(SystemEvent.timestamp.desc(), SystemEvent.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

    @staticmethod
    def get_by_type(
        db: Session, event_type: str, limit: int = 50
    ) -> List[SystemEvent]:
        """Returns events filtered by type (e.g. NETWORK_OFFLINE, BUFFER_SYNC)."""
        stmt = (
            select(SystemEvent)
            .where(SystemEvent.event_type == event_type)
            .order_by(SystemEvent.timestamp.desc(), SystemEvent.id.desc())
            .limit(limit)
        )
        return list(db.scalars(stmt).all())

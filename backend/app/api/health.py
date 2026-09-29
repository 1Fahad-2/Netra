"""
MachineMind — Health API
Provides service health status, versioning, and database connectivity state.
"""

from fastapi import APIRouter
from app.core.config import settings
from app.database.connection import check_db_connection

router = APIRouter(tags=["Health"])


@router.get("/health")
async def get_health():
    """
    Returns backend health and database connectivity diagnostics.
    """
    db_connected, db_msg = check_db_connection()

    response_data = {
        "status": "healthy" if db_connected else "degraded",
        "service": "NETRA — Backend Service",
        "version": settings.VERSION,
        "checkpoint": settings.CHECKPOINT,
        "storage": "postgresql",
        "database": "connected" if db_connected else "disconnected",
        "active_fleet_count": 2,
        "supported_vehicles": ["HEMM-01", "HEMM-02"],
    }

    if not db_connected:
        response_data["database_error"] = db_msg

    return response_data

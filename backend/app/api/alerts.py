"""
MachineMind — Alerts API
Exposes active safety alerts derived deterministically from telemetry proximity calculations.
"""

from typing import List
from fastapi import APIRouter

from app.schemas.alert import AlertItem
from app.services.telemetry_service import telemetry_service

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertItem])
async def list_alerts():
    """
    Returns currently active safety alerts derived from received vehicle telemetry.
    
    Deterministic derivation:
    - HIGH risk creates a CRITICAL proximity hazard alert with recommended hold action.
    - MEDIUM risk creates a WARNING proximity advisory with recommended speed reduction.
    - LOW risk clears active proximity alerts.
    """
    return telemetry_service.get_alerts()

"""
MachineMind — Vehicles API
Exposes the registered prototype mining fleet (strictly HEMM-01 and HEMM-02).
"""

from typing import List
from fastapi import APIRouter, HTTPException, status

from app.schemas.vehicle import VehicleResponse
from app.services.telemetry_service import telemetry_service

router = APIRouter(prefix="/api/vehicles", tags=["Vehicles"])


@router.get("", response_model=List[VehicleResponse])
async def list_vehicles():
    """
    Returns the registered prototype fleet.
    Strictly returns HEMM-01 and HEMM-02 (no fake fleet inflation).
    """
    return telemetry_service.get_vehicles()


@router.get("/{vehicle_id}", response_model=VehicleResponse)
async def get_vehicle(vehicle_id: str):
    """
    Returns details for a specific vehicle by ID.
    Returns 404 Not Found if vehicle is not registered.
    """
    vehicle = telemetry_service.get_vehicle(vehicle_id.upper())
    if not vehicle:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{vehicle_id}' not found. Registered prototypes are HEMM-01 and HEMM-02.",
        )
    return vehicle

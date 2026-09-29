"""
MachineMind — Vehicle Schemas
Represents exactly registered prototype vehicles (HEMM-01 and HEMM-02).
"""

from pydantic import BaseModel, Field


class VehicleResponse(BaseModel):
    vehicle_id: str = Field(..., description="Unique vehicle callsign e.g. HEMM-01")
    vehicle_type: str = Field(..., description="Operational category e.g. 100T DUMPER (FOLLOWING)")
    status: str = Field(..., description="Operational status e.g. ACTIVE, STANDBY")
    data_provenance: str = Field(..., description="Data provenance anchor e.g. SIMULATED")
    registered_at: str = Field(..., description="Registration timestamp")

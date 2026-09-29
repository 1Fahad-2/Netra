"""
MachineMind — Alert Schemas
Direct mirror of AlertItem from src/types/contract.ts.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field


class AlertItem(BaseModel):
    id: str = Field(..., description="Unique alert identifier")
    vehicle_id: str = Field(..., description="Target vehicle ID e.g. HEMM-01")
    severity: Literal["CRITICAL", "WARNING", "INFO"] = Field(..., description="Severity level")
    title: str = Field(..., description="Alert headline")
    reason: str = Field(..., description="Underlying collision risk or condition explanation")
    timestamp: str = Field(..., description="ISO 8601 creation timestamp")
    relative_time: str = Field(..., description="Display friendly relative time e.g. 'JUST NOW'")
    lat: Optional[float] = Field(None, description="Optional alert latitude coordinate")
    lon: Optional[float] = Field(None, description="Optional alert longitude coordinate")

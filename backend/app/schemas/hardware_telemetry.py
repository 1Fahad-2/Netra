from typing import Optional
from pydantic import BaseModel, Field
from .telemetry import SensorState

class HardwareTelemetry(BaseModel):
    """Lightweight schema for raw ESP32 hardware telemetry ingestion.
    Only the raw sensor fields are required. All other fields needed by the
    internal VehicleTelemetry model will be populated server‑side with safe defaults.
    """
    vehicle_id: str = Field(..., description="HEMM‑01 or HEMM‑02 identifier")
    timestamp: str = Field(..., description="ISO‑8601 UTC timestamp from device")
    latitude: float = Field(..., description="WGS‑84 latitude from GPS")
    longitude: float = Field(..., description="WGS‑84 longitude from GPS")
    altitude: Optional[float] = Field(None, description="Optional GPS altitude in meters (MSL)")
    gps_accuracy: Optional[float] = Field(None, description="Horizontal GPS accuracy in meters")
    speed: float = Field(0.0, description="Ground speed in km/h (default 0)")
    heading: float = Field(0.0, description="Compass heading 0‑359° (default 0)")
    obstacle_distance: Optional[float] = Field(None, description="Distance to nearest obstacle in meters")
    sensor_status: Optional[SensorState] = Field(SensorState.HEALTHY, description="Overall health of the hardware sensors")

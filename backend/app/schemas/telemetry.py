"""
MachineMind — Telemetry Schema
Strict 1:1 Pydantic implementation of src/types/contract.ts (VehicleTelemetry).
Zero renamed fields, zero invented enum values.
"""

from enum import StrEnum
from typing import Optional
from pydantic import BaseModel, Field


class RiskLevel(StrEnum):
    """Four-level Phase-2A risk contract.

    Matches the frontend SafetyLevel type in frontend/src/types/contract.ts.
    Prototype thresholds — not official DGMS/NMDC limits.

      CRITICAL : gap < 10 m  OR  TTC < 2 s
      HIGH     : gap < 20 m  OR  TTC < 4 s
      CAUTION  : gap < 30 m  OR  TTC < 6 s
      NORMAL   : safe following distance
      UNKNOWN  : insufficient or invalid telemetry
    """
    NORMAL   = "NORMAL"
    CAUTION  = "CAUTION"
    HIGH     = "HIGH"
    CRITICAL = "CRITICAL"
    UNKNOWN  = "UNKNOWN"


class RecommendedAction(StrEnum):
    PROCEED = "PROCEED"
    REDUCE_SPEED = "REDUCE SPEED"
    HOLD = "HOLD"
    NOT_AVAILABLE = "NOT AVAILABLE"


class SensorState(StrEnum):
    HEALTHY = "HEALTHY"
    WARNING = "WARNING"
    FAILED = "FAILED"
    NOT_CONNECTED = "NOT_CONNECTED"
    SIMULATED = "SIMULATED"


class VisibilityCondition(StrEnum):
    NORMAL = "NORMAL"
    DEGRADED = "DEGRADED"
    POOR = "POOR"
    UNKNOWN = "UNKNOWN"


class NetworkStatus(StrEnum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    STANDBY = "STANDBY"


class DataMode(StrEnum):
    SIMULATION = "SIMULATION"
    PHYSICAL_TESTBED = "PHYSICAL_TESTBED"
    LIVE = "LIVE"


class Position3D(BaseModel):
    latitude: float = Field(..., description="WGS-84 or representative mine latitude")
    longitude: float = Field(..., description="WGS-84 or representative mine longitude")
    altitude: Optional[float] = Field(None, description="Elevation in meters MSL")


class SensorHealthRecord(BaseModel):
    radar: SensorState
    thermal: SensorState
    gnss: SensorState
    imu: SensorState


class VehicleTelemetry(BaseModel):
    vehicle_id: str = Field(..., description="HEMM-01 or HEMM-02 identifier")
    vehicle_type: str = Field(..., description="Vehicle class e.g. 100T DUMPER (FOLLOWING)")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    position: Position3D
    heading: float = Field(..., ge=0.0, le=360.0, description="Compass bearing (0-359 degrees)")
    speed: float = Field(..., ge=0.0, description="Ground speed in km/h")
    # New optional fields for hardware telemetry
    gps_accuracy: Optional[float] = Field(None, description="GPS horizontal accuracy in meters")
    sensor_status: Optional[SensorState] = Field(None, description="Overall sensor status reported by hardware")
    visibility_condition: VisibilityCondition
    object_detected: bool = Field(..., description="Proximity radar/vision object trigger")
    object_type: Optional[str] = Field(None, description="Identified obstacle type e.g. HEMM-02")
    object_distance: Optional[float] = Field(None, description="Distance to nearest obstacle in meters")
    relative_speed: Optional[float] = Field(None, description="Closing relative speed in m/s")
    ttc: Optional[float] = Field(None, description="Time to collision in seconds")
    risk_score: Optional[float] = Field(None, ge=0.0, le=1.0, description="Normalized collision risk score 0.0 - 1.0")
    risk_level: Optional[RiskLevel] = Field(None, description="Risk level assessment")
    recommended_action: Optional[RecommendedAction] = Field(None, description="Recommended operator action")
    risk_reason: Optional[str] = Field(None, description="Human‑readable reason for the risk assessment, e.g., V2V assessment details")
    sensor_health: SensorHealthRecord
    network_status: NetworkStatus
    data_mode: DataMode
    source_metadata: str = Field(..., description="Data provenance anchor e.g. SIMULATION")
    route_distance: float = Field(..., ge=0, le=1850, description="Vehicle distance along canonical route in meters")
    section_id: str = Field(..., description="Current route section identifier (e.g., SEC-01)")
    data_source: str = Field("SIMULATED", description="Controlled source classification: SIMULATED, HARDWARE, DUMMY")


class TelemetryIngestResponse(BaseModel):
    status: str = "success"
    message: str = "Telemetry persisted in PostgreSQL database (CP6)"
    vehicle_id: str
    timestamp: str
    risk_level: RiskLevel
    risk_score: Optional[float] = None
    object_distance: Optional[float] = None
    relative_speed: Optional[float] = None
    ttc: Optional[float] = None
    recommended_action: Optional[RecommendedAction] = None
    risk_reason: Optional[str] = None

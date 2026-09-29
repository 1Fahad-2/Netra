"""
MachineMind — Database Models (SQLAlchemy 2.x)
Defines relational tables:
1. vehicles: Prototype HEMM registry
2. telemetry_events: Append-only historical telemetry stream
3. alerts: Safety incident and proximity alerts
4. sensor_health: Individual sensor status diagnostics
5. system_events: Operational state change audit log
"""

from datetime import datetime, timezone
from typing import Optional, List, Any
from sqlalchemy import (
    Column,
    Integer,
    BigInteger,
    String,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    Index,
    JSON,
)

from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.database.connection import Base


def utc_now() -> datetime:
    """Returns current UTC timestamp with timezone awareness."""
    return datetime.now(timezone.utc)


class Vehicle(Base):
    """
    Vehicles table: Stable registry for prototype HEMM machines.
    Strictly seeded with HEMM-01 and HEMM-02.
    """
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    vehicle_type: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)
    data_provenance: Mapped[str] = mapped_column(String(32), default="SIMULATED", nullable=False)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    # Relationships
    telemetry_events: Mapped[List["TelemetryEvent"]] = relationship(
        "TelemetryEvent", back_populates="vehicle", cascade="all, delete-orphan", lazy="selectin"
    )
    alerts: Mapped[List["Alert"]] = relationship(
        "Alert", back_populates="vehicle", cascade="all, delete-orphan", lazy="selectin"
    )
    sensor_health_records: Mapped[List["SensorHealth"]] = relationship(
        "SensorHealth", back_populates="vehicle", cascade="all, delete-orphan", lazy="selectin"
    )
    system_events: Mapped[List["SystemEvent"]] = relationship(
        "SystemEvent", back_populates="vehicle", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<Vehicle vehicle_id={self.vehicle_id!r} type={self.vehicle_type!r} status={self.status!r}>"


class TelemetryEvent(Base):
    """
    Telemetry Events table: Append-only historical telemetry data.
    Historical records are NEVER updated or overwritten.
    """
    __tablename__ = "telemetry_events"

    id: Mapped[int] = mapped_column(BigInteger().with_variant(Integer, "sqlite"), primary_key=True, autoincrement=True)
    vehicle_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("vehicles.vehicle_id", ondelete="CASCADE"), index=True, nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    altitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading: Mapped[float] = mapped_column(Float, nullable=False)
    # New hardware‑related fields
    gps_accuracy: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sensor_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), nullable=False, default="SIMULATED")
    speed: Mapped[float] = mapped_column(Float, nullable=False)
    visibility_condition: Mapped[str] = mapped_column(String(32), nullable=False)
    object_detected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    object_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    object_distance: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    relative_speed: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ttc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    recommended_action: Mapped[str] = mapped_column(String(32), nullable=False)

    # Sensor health states (flattened structured fields)
    sensor_radar: Mapped[str] = mapped_column(String(32), nullable=False)
    sensor_thermal: Mapped[str] = mapped_column(String(32), nullable=False)
    sensor_gnss: Mapped[str] = mapped_column(String(32), nullable=False)
    sensor_imu: Mapped[str] = mapped_column(String(32), nullable=False)

    network_status: Mapped[str] = mapped_column(String(32), nullable=False)
    data_mode: Mapped[str] = mapped_column(String(32), nullable=False)
    source_metadata: Mapped[str] = mapped_column(String(255), nullable=False)
    route_distance: Mapped[float] = mapped_column(Float, nullable=False)
    section_id: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Parent relationship
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="telemetry_events")

    # Composite and single indexes for performance
    __table_args__ = (
        Index("idx_telemetry_vehicle_timestamp", "vehicle_id", "timestamp"),
        Index("idx_telemetry_risk_level", "risk_level"),
    )

    def __repr__(self) -> str:
        return f"<TelemetryEvent vehicle={self.vehicle_id!r} time={self.timestamp.isoformat()!r} risk={self.risk_level!r}>"


class Alert(Base):
    """
    Alerts table: Safety alerts persisted separately from raw telemetry.
    """
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("vehicles.vehicle_id", ondelete="CASCADE"), index=True, nullable=False
    )
    severity: Mapped[str] = mapped_column(String(32), nullable=False)  # CRITICAL, WARNING, INFO
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    relative_time: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    latitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    longitude: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Parent relationship
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="alerts")

    def __repr__(self) -> str:
        return f"<Alert id={self.id!r} vehicle={self.vehicle_id!r} severity={self.severity!r} title={self.title!r}>"


class SensorHealth(Base):
    """
    Sensor Health table: Detailed sensor diagnostic snapshots.
    """
    __tablename__ = "sensor_health"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("vehicles.vehicle_id", ondelete="CASCADE"), index=True, nullable=False
    )
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    radar: Mapped[str] = mapped_column(String(32), nullable=False)
    thermal: Mapped[str] = mapped_column(String(32), nullable=False)
    gnss: Mapped[str] = mapped_column(String(32), nullable=False)
    imu: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Parent relationship
    vehicle: Mapped["Vehicle"] = relationship("Vehicle", back_populates="sensor_health_records")

    def __repr__(self) -> str:
        return f"<SensorHealth vehicle={self.vehicle_id!r} timestamp={self.timestamp.isoformat()!r}>"


class SystemEvent(Base):
    """
    System Events table: Operational audit log for edge/fleet events.
    Types: NETWORK_OFFLINE, NETWORK_ONLINE, SENSOR_FAILURE, SENSOR_RECOVERY, BUFFER_SYNC.
    """
    __tablename__ = "system_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vehicle_id: Mapped[Optional[str]] = mapped_column(
        String(32), ForeignKey("vehicles.vehicle_id", ondelete="SET NULL"), index=True, nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    event_metadata: Mapped[Optional[Any]] = mapped_column(
        JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Parent relationship
    vehicle: Mapped[Optional["Vehicle"]] = relationship("Vehicle", back_populates="system_events")

    def __repr__(self) -> str:
        return f"<SystemEvent type={self.event_type!r} vehicle={self.vehicle_id!r} time={self.timestamp.isoformat()!r}>"

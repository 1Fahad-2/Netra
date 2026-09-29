"""0001_initial_schema

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-09-11 00:00:00.000000

"""
from datetime import datetime, timezone
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. vehicles table
    op.create_table(
        'vehicles',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('vehicle_id', sa.String(length=32), nullable=False),
        sa.Column('vehicle_type', sa.String(length=64), nullable=False),
        sa.Column('status', sa.String(length=32), server_default='ACTIVE', nullable=False),
        sa.Column('data_provenance', sa.String(length=32), server_default='SIMULATED', nullable=False),
        sa.Column('registered_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vehicle_id')
    )
    op.create_index('ix_vehicles_vehicle_id', 'vehicles', ['vehicle_id'], unique=True)

    # Deterministic seed for exactly HEMM-01 and HEMM-02
    vehicles_table = sa.table(
        'vehicles',
        sa.column('vehicle_id', sa.String),
        sa.column('vehicle_type', sa.String),
        sa.column('status', sa.String),
        sa.column('data_provenance', sa.String),
        sa.column('registered_at', sa.DateTime(timezone=True)),
        sa.column('updated_at', sa.DateTime(timezone=True)),
    )
    now_utc = datetime.now(timezone.utc)
    op.bulk_insert(
        vehicles_table,
        [
            {
                'vehicle_id': 'HEMM-01',
                'vehicle_type': '100T DUMPER (FOLLOWING)',
                'status': 'ACTIVE',
                'data_provenance': 'SIMULATED',
                'registered_at': now_utc,
                'updated_at': now_utc,
            },
            {
                'vehicle_id': 'HEMM-02',
                'vehicle_type': '100T DUMPER (LEAD)',
                'status': 'ACTIVE',
                'data_provenance': 'SIMULATED',
                'registered_at': now_utc,
                'updated_at': now_utc,
            },
        ]
    )

    # 2. telemetry_events table (Append-only)
    op.create_table(
        'telemetry_events',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
        sa.Column('vehicle_id', sa.String(length=32), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('altitude', sa.Float(), nullable=True),
        sa.Column('heading', sa.Float(), nullable=False),
        sa.Column('speed', sa.Float(), nullable=False),
        sa.Column('visibility_condition', sa.String(length=32), nullable=False),
        sa.Column('object_detected', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('object_type', sa.String(length=64), nullable=True),
        sa.Column('object_distance', sa.Float(), nullable=True),
        sa.Column('relative_speed', sa.Float(), nullable=True),
        sa.Column('ttc', sa.Float(), nullable=True),
        sa.Column('risk_score', sa.Float(), nullable=True),
        sa.Column('risk_level', sa.String(length=32), nullable=False),
        sa.Column('recommended_action', sa.String(length=32), nullable=False),
        sa.Column('sensor_radar', sa.String(length=32), nullable=False),
        sa.Column('sensor_thermal', sa.String(length=32), nullable=False),
        sa.Column('sensor_gnss', sa.String(length=32), nullable=False),
        sa.Column('sensor_imu', sa.String(length=32), nullable=False),
        sa.Column('network_status', sa.String(length=32), nullable=False),
        sa.Column('data_mode', sa.String(length=32), nullable=False),
        sa.Column('source_metadata', sa.String(length=255), nullable=False),
        sa.Column('route_distance', sa.Float(), nullable=False),
        sa.Column('section_id', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.vehicle_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_telemetry_events_vehicle_id', 'telemetry_events', ['vehicle_id'], unique=False)
    op.create_index('ix_telemetry_events_timestamp', 'telemetry_events', ['timestamp'], unique=False)
    op.create_index('idx_telemetry_risk_level', 'telemetry_events', ['risk_level'], unique=False)
    op.create_index('idx_telemetry_vehicle_timestamp', 'telemetry_events', ['vehicle_id', 'timestamp'], unique=False)

    # 3. alerts table
    op.create_table(
        'alerts',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('vehicle_id', sa.String(length=32), nullable=False),
        sa.Column('severity', sa.String(length=32), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('relative_time', sa.String(length=64), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('status', sa.String(length=32), server_default='ACTIVE', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.vehicle_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_alerts_vehicle_id', 'alerts', ['vehicle_id'], unique=False)
    op.create_index('ix_alerts_timestamp', 'alerts', ['timestamp'], unique=False)

    # 4. sensor_health table
    op.create_table(
        'sensor_health',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('vehicle_id', sa.String(length=32), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('radar', sa.String(length=32), nullable=False),
        sa.Column('thermal', sa.String(length=32), nullable=False),
        sa.Column('gnss', sa.String(length=32), nullable=False),
        sa.Column('imu', sa.String(length=32), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.vehicle_id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sensor_health_vehicle_id', 'sensor_health', ['vehicle_id'], unique=False)
    op.create_index('ix_sensor_health_timestamp', 'sensor_health', ['timestamp'], unique=False)

    # 5. system_events table
    op.create_table(
        'system_events',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('vehicle_id', sa.String(length=32), nullable=True),
        sa.Column('event_type', sa.String(length=64), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('event_metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.vehicle_id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_system_events_vehicle_id', 'system_events', ['vehicle_id'], unique=False)
    op.create_index('ix_system_events_timestamp', 'system_events', ['timestamp'], unique=False)


def downgrade() -> None:
    op.drop_table('system_events')
    op.drop_table('sensor_health')
    op.drop_table('alerts')
    op.drop_table('telemetry_events')
    op.drop_table('vehicles')

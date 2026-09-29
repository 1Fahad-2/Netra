"""Add hardware telemetry fields

Revision ID: 0002_add_hardware_fields
Revises: 0001_initial_schema
Create Date: 2026-09-20 15:58:00
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0002_add_hardware_fields"

down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column(
        "telemetry_events",
        sa.Column("gps_accuracy", sa.Float(), nullable=True),
    )
    op.add_column(
        "telemetry_events",
        sa.Column("sensor_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "telemetry_events",
        sa.Column(
            "data_source",
            sa.String(length=32),
            nullable=False,
            server_default=sa.text("'SIMULATED'"),
        ),
    )
    # Remove default after column creation – the application will always set a value.
    op.alter_column("telemetry_events", "data_source", server_default=None)

def downgrade() -> None:
    op.drop_column("telemetry_events", "data_source")
    op.drop_column("telemetry_events", "sensor_status")
    op.drop_column("telemetry_events", "gps_accuracy")

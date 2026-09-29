"""
MachineMind — Backend Service Entrypoint
Checkpoint 6: Telemetry API Persistence Integration (FastAPI + SQLAlchemy 2.x)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.api import health, vehicles, telemetry, alerts, websocket, network, esp

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description=(
        "Industrial Mining Safety Command Center API.\n\n"
        "Provides REST endpoints for prototype fleet registration (HEMM-01, HEMM-02), "
        "common telemetry contract ingestion, and deterministic collision proximity alerts.\n\n"
        "**Persistence Boundary:** Backed by PostgreSQL persistence layer using SQLAlchemy 2.x. "
        "All ingested telemetry is persisted chronologically to the append-only ledger.\n\n"
        "**Live Distribution:** Real-time WebSocket stream (/ws/telemetry) delivering committed telemetry events."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS middleware for local React / Vite dev server integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(health.router)
app.include_router(vehicles.router)
app.include_router(telemetry.router)
app.include_router(alerts.router)
app.include_router(websocket.router)
app.include_router(network.router)
app.include_router(esp.router)


@app.get("/", tags=["Root"])
async def root():
    """Service root banner."""
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "checkpoint": settings.CHECKPOINT,
        "documentation": "/docs",
        "health_check": "/health",
    }
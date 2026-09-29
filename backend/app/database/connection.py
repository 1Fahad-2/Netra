"""
MachineMind — Database Connection & Session Management
SQLAlchemy 2.x Engine & Session Factory for PostgreSQL.
"""

import os
from typing import Generator, Tuple
from sqlalchemy import create_engine, text, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker, Session, DeclarativeBase

from app.core.config import settings


class Base(DeclarativeBase):
    """SQLAlchemy 2.x declarative base class."""
    pass


# SQLite Foreign Key Enabler (active when SQLite engine is used in isolated test suites)
@event.listens_for(Engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in str(type(dbapi_connection)).lower() or hasattr(dbapi_connection, "cursor"):
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys=ON")
        except Exception:
            pass
        finally:
            cursor.close()


def create_db_engine(url: str | None = None):
    """Factory creating an engine with production-ready connection options."""
    db_url = url or settings.DATABASE_URL

    connect_args = {}
    engine_kwargs = {
        "echo": False,
        "future": True,
    }

    if db_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        engine_kwargs["connect_args"] = connect_args
    else:
        # PostgreSQL pool configuration with fast connection timeout
        connect_args["connect_timeout"] = 3
        engine_kwargs["connect_args"] = connect_args
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_size"] = 10
        engine_kwargs["max_overflow"] = 20

    return create_engine(db_url, **engine_kwargs)


# Module-level default engine and session factory
engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a managed database session.
    Automatically closes session on request completion.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_db_connection(target_engine: Engine | None = None) -> Tuple[bool, str]:
    """
    Executes a lightweight query (SELECT 1) to verify database connectivity.
    Returns (is_connected, message).
    """
    eng = target_engine or engine
    try:
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, "connected"
    except Exception as exc:
        return False, str(exc)

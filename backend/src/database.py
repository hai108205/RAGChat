"""SQLAlchemy engine & session factory for PostgreSQL + pgVector."""

from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import NullPool

from src.config import settings


_engine: Engine | None = None
_session_factory: sessionmaker | None = None


def get_engine() -> Engine:
    """Return (or create) the global SQLAlchemy engine."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            poolclass=NullPool,
            echo=settings.debug,
        )
    return _engine


def get_session_factory() -> sessionmaker:
    """Return (or create) the global session factory."""
    global _session_factory
    if _session_factory is None:
        _session_factory = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return _session_factory


def get_session() -> Session:
    """Create a new SQLAlchemy session.

    Caller is responsible for closing the session.
    """
    return get_session_factory()()


def dispose_engine() -> None:
    """Dispose the global engine, releasing all connections."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
        _engine = None
    _session_factory = None
"""SQLite engine and session factory for the DocumentRegistry."""

from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

from src.config import settings
from src.models import DocumentRecord  # noqa: F401 — register table metadata

_engine = None


def get_engine():
    """Return (and lazily create) the SQLite engine for the registry."""
    global _engine
    if _engine is None:
        # Ensure the parent directory of the SQLite file exists
        db_path = settings.registry_url.split("///")[-1]
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(settings.registry_url)
        SQLModel.metadata.create_all(_engine)
    return _engine


def get_registry_session() -> Session:
    """Open a new registry session (caller closes it)."""
    return Session(get_engine())

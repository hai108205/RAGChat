"""Global singleton state — initialized at FastAPI startup, consumed by dependency injection."""

from typing import Optional
from sqlalchemy import Engine


# Singleton instances set during lifespan startup
db_engine: Optional[Engine] = None
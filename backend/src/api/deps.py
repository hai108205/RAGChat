"""FastAPI dependencies — authentication for /api/* routes."""

from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from src.config import settings

# auto_error=False so we can return a clean 401 instead of FastAPI's default
_bearer = HTTPBearer(auto_error=False)


async def require_api_key(
    credentials: HTTPAuthorizationCredentials | None = Security(_bearer),
) -> None:
    """Validate the Bearer token against settings.api_key.

    When settings.api_key is empty, authentication is disabled (dev mode).
    """
    if not settings.api_key:
        return

    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if credentials.credentials != settings.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

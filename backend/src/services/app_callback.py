"""Fire-and-forget notifications to the Rocket.Chat app callback endpoint.

The app registers a webhook at /api/app/callback (src/api/CallbackEndpoint.ts).
When APP_CALLBACK_URL is configured, the backend posts async job results there
so the app can notify the user (Plan.md 4.4 step 4).
"""

import httpx

from src.config import settings
from src.helpers.log import get_logger

logger = get_logger(__name__)


async def notify_app(event: str, *, user_id: str = "", room_id: str = "", **fields) -> None:
    """Post an event to the app callback endpoint. No-op when unconfigured."""
    if not settings.app_callback_url:
        return

    payload = {"event": event, "user_id": user_id, "room_id": room_id, **fields}
    headers = {}
    # Authenticate the callback with the shared api_key so the app can reject
    # spoofed notifications on its UNSECURE public endpoint.
    if settings.api_key:
        headers["Authorization"] = f"Bearer {settings.api_key}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(settings.app_callback_url, json=payload, headers=headers)
            if resp.status_code >= 400:
                logger.warning("App callback returned error", extra={"status": resp.status_code})
    except Exception as e:  # never let notification failures break indexing
        logger.warning("App callback failed", extra={"error": str(e)})

"""MinIO object storage client — raw document file storage.

Replaces local filesystem storage with S3-compatible MinIO.
Uses MinIO's async client for non-blocking uploads/downloads.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional

from minio import Minio
from minio.error import S3Error

from src.config import settings


class ObjectStore:
    """S3-compatible MinIO client for storing raw document files."""

    BUCKET_NAME = "ragchat-documents"

    def __init__(self) -> None:
        endpoint = settings.minio_endpoint
        # Strip scheme for MinIO client
        if "://" in endpoint:
            endpoint = endpoint.split("://", 1)[1]

        self._client = Minio(
            endpoint=endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self._endpoint = endpoint

    async def ensure_bucket(self) -> None:
        """Create the bucket if it doesn't exist."""
        import asyncio
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._ensure_bucket_sync,
        )

    def _ensure_bucket_sync(self) -> None:
        found = self._client.bucket_exists(self.BUCKET_NAME)
        if not found:
            self._client.make_bucket(self.BUCKET_NAME)

    async def upload(self, object_name: str, data: bytes, content_type: str = "application/octet-stream") -> str:
        """Upload a file to MinIO. Returns the object name."""
        import asyncio
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._upload_sync,
            object_name,
            data,
            content_type,
        )
        return object_name

    def _upload_sync(self, object_name: str, data: bytes, content_type: str) -> None:
        self._client.put_object(
            bucket_name=self.BUCKET_NAME,
            object_name=object_name,
            data=io.BytesIO(data),
            length=len(data),
            content_type=content_type,
        )

    async def download(self, object_name: str) -> bytes:
        """Download a file from MinIO."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._download_sync,
            object_name,
        )

    def _download_sync(self, object_name: str) -> bytes:
        try:
            response = self._client.get_object(
                bucket_name=self.BUCKET_NAME,
                object_name=object_name,
            )
            return response.read()
        finally:
            response.close()
            response.release_conn()

    async def delete(self, object_name: str) -> None:
        """Delete a file from MinIO."""
        import asyncio
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None,
            self._delete_sync,
            object_name,
        )

    def _delete_sync(self, object_name: str) -> None:
        try:
            self._client.remove_object(
                bucket_name=self.BUCKET_NAME,
                object_name=object_name,
            )
        except S3Error:
            pass  # Object already gone — no-op

    async def delete_prefix(self, prefix: str) -> int:
        """Delete all objects with a given prefix. Returns count of deleted objects."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._delete_prefix_sync,
            prefix,
        )

    def _delete_prefix_sync(self, prefix: str) -> int:
        objects = self._client.list_objects(
            bucket_name=self.BUCKET_NAME,
            prefix=prefix,
            recursive=True,
        )
        count = 0
        for obj in objects:
            self._client.remove_object(
                bucket_name=self.BUCKET_NAME,
                object_name=obj.object_name,
            )
            count += 1
        return count

    async def exists(self, object_name: str) -> bool:
        """Check if an object exists."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None,
            self._exists_sync,
            object_name,
        )

    def _exists_sync(self, object_name: str) -> bool:
        try:
            self._client.stat_object(
                bucket_name=self.BUCKET_NAME,
                object_name=object_name,
            )
            return True
        except S3Error:
            return False


# Singleton
_object_store: Optional[ObjectStore] = None


def get_object_store() -> ObjectStore:
    """Get or create the MinIO object store singleton."""
    global _object_store
    if _object_store is None:
        _object_store = ObjectStore()
    return _object_store
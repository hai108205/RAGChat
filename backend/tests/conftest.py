"""Pytest configuration for the RAGChat backend tests."""

import pytest
import sys
from pathlib import Path

# Ensure backend/src is in the path
backend_src = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(backend_src))


@pytest.fixture(scope="session")
def anyio_backend():
    return "asyncio"
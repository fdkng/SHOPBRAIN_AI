"""Shim entrypoint for Render when service root is `backend`.

Exports `app` from the real backend module so `uvicorn backend.main:app` works.
"""

from main import app  # noqa: F401

"""Backend package initializer.

This file makes the `backend` directory an importable Python package so
`uvicorn backend.main:app` works when the process runs from the project root.
"""

__all__ = ["main"]

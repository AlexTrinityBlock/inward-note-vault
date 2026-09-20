"""Liveness endpoint, used by the frontend and by container health checks."""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict[str, str]:
    """Report that the API process is serving requests."""
    return {"status": "ok"}

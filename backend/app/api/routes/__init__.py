"""API routers.

`api_router` groups the resource routers under `/api`; operational endpoints
such as `/health` stay at the root of the service.
"""

from fastapi import APIRouter

from app.api.routes import auth, categories, crypto, folders, health, notes, settings

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router)
api_router.include_router(settings.router)
api_router.include_router(folders.router)
api_router.include_router(categories.router)
api_router.include_router(crypto.router)
api_router.include_router(notes.router)

__all__ = ["api_router", "health"]

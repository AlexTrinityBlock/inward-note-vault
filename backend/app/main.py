"""FastAPI application entry point."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from app.api.routes import api_router, health
from app.core.config import Settings, get_settings
from app.core.db import create_database
from app.core.migrations import upgrade_to_head

REPO_ROOT = Path(__file__).resolve().parents[2]

_NOT_BUILT = """<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Inward Note Vault</title></head>
  <body style="font-family: system-ui; max-width: 40rem; margin: 4rem auto">
    <h1>Inward Note Vault</h1>
    <p>The API is running, but the web client has not been built yet.</p>
    <pre>cd frontend &amp;&amp; bun install &amp;&amp; bun run build</pre>
    <p>Then reload this page. The API docs live at <a href="/docs">/docs</a>.</p>
  </body>
</html>
"""


def default_static_dir() -> Path:
    """Where `bun run build` puts the SPA."""
    return REPO_ROOT / "frontend" / "dist"


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build the FastAPI application, including its database handle."""
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        upgrade_to_head(settings)
        try:
            yield
        finally:
            app.state.db.dispose()

    app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)
    app.state.settings = settings
    app.state.db = create_database(settings.resolved_database_url, echo=settings.debug)

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health.router)
    app.include_router(api_router)
    _mount_spa(app, settings.static_dir or default_static_dir())
    return app


def _mount_spa(app: FastAPI, directory: Path) -> None:
    """Serve the built single-page app.

    Registered last so that API and documentation routes always win. The build
    output is checked per request, so building the client after the API started
    still works without a restart.
    """
    resolved = directory.resolve()
    index = resolved / "index.html"

    @app.get("/{path:path}", include_in_schema=False, response_model=None)
    def spa(path: str) -> FileResponse | HTMLResponse:
        if path.startswith(("api/", "docs", "openapi.json", "redoc")):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

        candidate = (resolved / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(resolved):
            return FileResponse(candidate)

        if not index.is_file():
            return HTMLResponse(_NOT_BUILT, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)

        return FileResponse(index)


app = create_app()

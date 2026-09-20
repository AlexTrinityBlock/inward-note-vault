"""Command-line entry point: `uv run inward-note-vault`."""

import argparse

import uvicorn

from app.core.config import get_settings
from app.main import create_app


def main() -> None:
    """Serve the API, running schema migrations first."""
    settings = get_settings()

    parser = argparse.ArgumentParser(
        prog="inward-note-vault",
        description="Serve the Inward Note Vault API and web client.",
    )
    parser.add_argument("--host", default="127.0.0.1", help="bind address (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="port (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="restart on code changes")
    args = parser.parse_args()

    print(f"Inward Note Vault — database: {settings.sqlite_path}")
    print(f"Open http://{args.host}:{args.port} once the server is up.")

    if args.reload:
        uvicorn.run("app.main:app", host=args.host, port=args.port, reload=True)
    else:
        uvicorn.run(create_app(settings), host=args.host, port=args.port)


if __name__ == "__main__":
    main()

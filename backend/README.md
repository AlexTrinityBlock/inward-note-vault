# Inward Note Vault — backend

FastAPI service for the Inward Note Vault: it stores notes, and uses TypeSafe
System One models to turn note text into typed judgments the API can serve.

## Layout

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/        # one module per resource, aggregated in routes/__init__.py
│   │   └── deps.py        # shared FastAPI dependencies
│   ├── core/
│   │   ├── config.py      # settings from the environment / .env
│   │   ├── db.py          # SQLAlchemy engine, session factory, declarative base
│   │   ├── security.py    # password hashing and token helpers
│   │   └── typesafe.py    # TypeSafe client construction
│   ├── crud.py            # database operations
│   ├── models.py          # SQLAlchemy models
│   └── main.py            # FastAPI application
├── alembic/               # database migrations
└── pyproject.toml
```

## Run it

```bash
# from this directory
uv sync
uv run fastapi dev app/main.py        # http://127.0.0.1:8000, docs at /docs
```

Migrations:

```bash
uv run alembic upgrade head
uv run alembic revision --autogenerate -m "describe the change"
```

## Configuration

Settings load from the process environment and from `.env` in this directory or
in the repository root (see `app/core/config.py`).

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql+psycopg://vault:vault@localhost:5432/vault` | SQLAlchemy/Alembic connection string |
| `TYPESAFE_API_KEY` | — | TypeSafe API key; server-side only |
| `TYPESAFE_DEFAULT_MODEL` | SDK default (`jev-latest`) | Model used for System One calls |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | Browser origins allowed to call the API |

## TypeSafe

Judgment design follows the TypeSafe skill in `.dsh/skills/typesafe-ai`, and the
live docs at <https://docs.typesafe.ai> are the source of truth for API details.
The API key never leaves the server: the browser talks to this API, never to
TypeSafe directly.

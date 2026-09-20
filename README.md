# inward-note-vault

Capture notes, then let TypeSafe System One models turn them into typed,
reusable judgments the app can filter, rank and act on.

> Status: v0.1.0 skeleton. The service boundaries and toolchain are in place;
> features land on `develop`.

## Stack

| Part | Technology |
| --- | --- |
| Backend | Python 3.14, FastAPI, SQLAlchemy, Alembic, [uv](https://docs.astral.sh/uv/) |
| Frontend | React, TypeScript, Vite, [Bun](https://bun.sh), [Orval](https://orval.dev) |
| AI | [TypeSafe](https://docs.typesafe.ai) System One models (Jev) via `typesafe-sdk` |
| Database | PostgreSQL 17 |

## Layout

```
├── backend/          # FastAPI service (app/, alembic/, pyproject.toml)
├── frontend/         # React + TypeScript client (src/, vite.config.ts)
├── .dsh/skills/      # project skills, including TypeSafe judgment guidance
├── docker-compose.yml
└── private-docs/     # local notes, never committed
```

## Getting started

Everything at once, with PostgreSQL:

```bash
docker compose up
# API      http://127.0.0.1:8000  (docs at /docs)
# frontend http://127.0.0.1:5173
```

Or run each side directly:

```bash
cd backend  && uv sync && uv run fastapi dev app/main.py
cd frontend && bun install && bun run dev
```

Either way, copy `.env` values for local secrets; the TypeSafe API key
(`TYPESAFE_API_KEY`) is read by the backend only and never reaches the browser.

## TypeSafe

The backend owns every model call: it sends note state plus typed questions, and
stores or serves the judgments. Judgment design follows the TypeSafe skill in
`.dsh/skills/typesafe-ai`, and <https://docs.typesafe.ai> is the source of truth
for current API details.

## Versioning

Development happens on `develop`; `master` tracks released history. Releases are
tagged `vX.Y.Z` — see [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).

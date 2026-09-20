# inward-note-vault

A self-hosted notebook you can run with one command. Notes live in SQLite; the
ones you mark as encrypted are sealed in your browser, so the server only ever
stores ciphertext. A one-click action asks Jev (TypeSafe System One) where a note
belongs — the classification is optional, and encrypted notes ask for consent
first, because that is the one moment their text leaves your browser.

> Status: v0.2.0 — the app is complete end to end: accounts, both notebooks,
> folders, tags, classification, three UI languages.

## Highlights

- **Runs anywhere.** One `uv run` on a machine with Python, or `docker compose up`.
  No database server, no build step for the client in the container image.
- **Two notebooks.** Plain notes are stored as text and searchable. Encrypted
  notes are encrypted in the browser with a password the server never sees.
- **Editor + preview.** Write Markdown on the left, read it rendered on the right.
- **Folders and tags.** A `parent_id` folder tree and tags shared by both notebooks.
- **Jev classification.** One request returns a folder choice plus a probability
  for each candidate tag; you accept, adjust or ignore it.
- **三種語言.** English, 繁體中文 and 简体中文.

## Quick start

### Docker

```bash
docker compose up --build
# open http://127.0.0.1:8000
```

The SQLite file lives on the `vault-data` volume, so it survives rebuilds.
Development servers with hot reload are in `docker-compose.dev.yml`.

### Bare metal (uv)

```bash
# 1. run the tests / install dependencies
cd backend
uv sync

# 2. build the web client once (Bun: https://bun.sh)
cd ../frontend
bun install
bun run build

# 3. serve everything from one process
cd ../backend
uv run inward-note-vault          # http://127.0.0.1:8000
```

The first visit leads through setup: create the account, and optionally paste a
TypeSafe API key. The database file is created at `backend/data/vault.db` and
migrations run at start-up.

## How the two notebooks differ

| | Plain | Encrypted |
| --- | --- | --- |
| Where the text lives | SQLite, readable | Ciphertext only |
| Keys | — | PBKDF2-SHA256 (600k) → AES-GCM, derived in the browser |
| Server-side search | Yes | No — search happens in your browser after unlocking |
| Jev classification | Direct | Only after you confirm Jev will see the content |
| Recovery | — | None. Forget the notebook password and the notes are gone |

Not encrypted either way: note ids, timestamps, folder membership and tag names.
The server needs those to build the tree, the filters and the search index. The
password and the derived key never leave the browser; the server stores only the
KDF salt, the iteration count and a verifier blob. The TypeSafe API key is stored
in SQLite and never returned by the API.

## Layout

```
├── backend/            # FastAPI + SQLAlchemy + Alembic, SQLite storage
├── frontend/           # React + TypeScript, Vite, Bun, Orval-generated client
├── .dsh/skills/        # project skills, including TypeSafe judgment guidance
├── docker-compose.yml  # single container, SQLite on a volume
├── Dockerfile          # builds the client, then serves it from the API
└── private-docs/       # local notes, never committed
```

Each side has its own README with the details:
[backend](backend/README.md) · [frontend](frontend/README.md).

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `INWARD_DATA_DIR` | `data` | Directory holding `vault.db` |
| `INWARD_DATABASE_URL` / `DATABASE_URL` | SQLite in `INWARD_DATA_DIR` | Override the connection string |
| `INWARD_STATIC_DIR` | `../frontend/dist` | Built client to serve |
| `INWARD_COOKIE_SECURE` | `false` | Set when serving over HTTPS |
| `INWARD_SESSION_TTL_HOURS` | `720` | Session lifetime |
| `TYPESAFE_API_KEY` | — | Fallback when no key is stored in the database |

`.env` in the repository root or in `backend/` is read at start-up.

## Development

```bash
cd backend  && uv run pytest && uv run ruff check .     # 33 tests
cd frontend && bun test && bun run typecheck && bun run build   # 12 tests

# regenerate the typed API client after changing the API
cd frontend && bun run api:generate
```

## Versioning

Development happens on `develop`; `master` tracks released history. Releases are
tagged `vX.Y.Z` — see [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).

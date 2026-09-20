# Inward Note Vault — backend

FastAPI service that stores notes in SQLite and asks TypeSafe System One models
(Jev) to classify them. In production it also serves the built React client, so
a bare-metal install needs one process and one database file.

## Security model

| Concern | How it works |
| --- | --- |
| Account | First run creates one owner account; the password is stored as a scrypt hash. Later logins are verified against it. |
| Sessions | Login issues a bearer cookie. The database stores only a SHA-256 hash of the token, plus an expiry. |
| Plain notebook | Notes keep `title` and `body` on the server. They are searchable, and Jev can read them. |
| Encrypted notebook | The browser encrypts title and body into an AES-GCM blob. The API stores `ciphertext` + `iv` and never receives the password, the key, or the plaintext. |
| Encrypted-notebook parameters | `crypto_profiles` holds the KDF salt, iteration count and a verifier blob, so any browser can re-derive the key. They are useless without the password. |
| TypeSafe key | Stored in the `settings` table, returned only as `typesafe_configured: true/false`. It never reaches the browser. |
| Classification of encrypted notes | Refused unless the caller sends `consent: true` **and** the decrypted text, which is forwarded to TypeSafe and never stored. |

Metadata that stays readable on the server: note ids, timestamps, folder
membership, and tag names — including for encrypted notes, so the tree and tag
filters keep working. Only the note's title and body are encrypted.

## Layout

```
backend/
├── app/
│   ├── api/
│   │   ├── routes/        # auth, settings, folders, tags, crypto, notes, health
│   │   └── deps.py        # sessions, database session, TypeSafe client
│   ├── core/
│   │   ├── config.py      # settings from the environment / .env
│   │   ├── db.py          # engine, session factory, declarative base
│   │   ├── migrations.py  # alembic upgrade head at start-up
│   │   ├── security.py    # password hashing and session tokens
│   │   └── typesafe.py    # client + Jev judgment design for classification
│   ├── crud.py            # every database operation
│   ├── models.py          # users, sessions, settings, folders, tags, notes, crypto
│   ├── cli.py             # `inward-note-vault` console script
│   └── main.py            # application factory, SPA hosting
├── alembic/               # migrations
├── tests/                 # pytest suite (TestClient, fake TypeSafe client)
└── pyproject.toml
```

## Run it

```bash
cd backend
uv sync
uv run inward-note-vault              # http://127.0.0.1:8000, API docs at /docs
uv run inward-note-vault --reload     # development, restarts on changes
```

The first request to the UI leads through setup. The database file is created at
`data/vault.db` (relative to the working directory) with migrations applied at
start-up; `INWARD_DATA_DIR` moves it.

## Develop

```bash
uv run pytest             # 33 tests
uv run ruff check .       # lint
uv run ruff format .      # format
uv run alembic revision --autogenerate -m "describe the change"
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `INWARD_DATA_DIR` | `data` | Directory holding `vault.db` |
| `INWARD_DATABASE_URL` / `DATABASE_URL` | SQLite in `INWARD_DATA_DIR` | Override the connection string |
| `INWARD_SESSION_TTL_HOURS` | `720` | Session lifetime |
| `INWARD_COOKIE_SECURE` | `false` | Set when serving over HTTPS |
| `INWARD_CORS_ORIGINS` | `["http://localhost:5173"]` | Extra browser origins for development |
| `INWARD_STATIC_DIR` | `../frontend/dist` | Built client to serve |
| `TYPESAFE_API_KEY` | — | Fallback when no key is stored in the database |

`.env` is read from this directory and from the repository root.

## API

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Liveness |
| GET | `/api/setup/status` | Whether first-run setup is still needed |
| POST | `/api/setup` | Create the owner account, optionally with the TypeSafe key |
| POST | `/api/auth/login`, `/api/auth/logout` | Session cookie |
| GET | `/api/auth/me` | Current account |
| GET/PATCH | `/api/settings` | Auto-classify flag, TypeSafe model; the key is write-only |
| POST | `/api/settings/typesafe/verify` | Check the stored key against TypeSafe |
| GET/POST | `/api/folders`, `/api/folders/{id}` | Folder tree via `parent_id` |
| GET/POST | `/api/tags`, `/api/tags/{id}` | Tags with usage counts |
| GET/POST | `/api/crypto/profile` | KDF parameters, stored once |
| GET/POST | `/api/notes` | `notebook`, `folder_id`, `tag`, `q`, `limit`, `offset` |
| GET/PATCH/DELETE | `/api/notes/{id}` | Plain or encrypted payload |
| POST | `/api/notes/{id}/classify` | Jev suggestions; encrypted notes need `consent` + `content` |

## TypeSafe judgments

Classification is one request per note: one `Choice` over the existing folders
(always including a "nothing fits" option) plus one `Noul` per candidate tag, so
several tags can be true at once. Candidates are the user's tags plus the
shipped starter vocabulary in `app/core/typesafe.py`; Jev only selects, code
creates the tags once the user accepts them. Design guidance lives in the
TypeSafe skill at `.dsh/skills/typesafe-ai`, and the live docs at
<https://docs.typesafe.ai> are the source of truth for API details.

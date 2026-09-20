# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- SQLite storage with Alembic migrations applied at start-up, and a
  `uv run inward-note-vault` console script that serves the API and the built
  client from one process.
- First-run setup for the owner account, scrypt password hashing, and
  cookie sessions stored as token hashes.
- Notes split into two notebooks: plain notes stored as text, and end-to-end
  encrypted notes where the browser sends only AES-GCM ciphertext, so the
  server cannot read their title or body.
- Encrypted-notebook KDF profile endpoints (salt, iterations, verifier) that
  never receive the password or the derived key.
- Folder tree through `parent_id`, tags shared across notebooks, and note
  search that covers plain notes.
- One-click classification with Jev: a folder choice plus one yes/no question
  per candidate tag, sent in a single request, with an explicit consent step
  before any decrypted text reaches TypeSafe.
- A 33-case pytest suite covering auth, notes, folders, tags, crypto
  parameters, classification, and SPA hosting.

### Changed

- Replaced the PostgreSQL driver with SQLite, so the app runs bare-metal with
  no external services.

### Added

- `backend/`: FastAPI skeleton — `app/api/routes` (health, notes), `app/core`
  (config, db, security, typesafe), `crud.py`, `models.py`, `main.py`, and
  Alembic migrations.
- `frontend/`: React + TypeScript client on Bun and Vite, with Orval wired to
  generate typed React Query hooks from the backend OpenAPI schema.
- `docker-compose.yml`: PostgreSQL 17, the API, and the Vite dev server.
- `.dsh/skills/typesafe-ai`: project skill carrying TypeSafe judgment guidance.
- `.gitignore` entries for generated API clients and frontend build output.

### Changed

- Moved the Python project from the repository root into `backend/`.

## [0.1.0] - 2026-09-20

### Added

- Initial project skeleton: `main.py` entry point and `pyproject.toml` (uv-managed, Python 3.14).
- `README.md` describing the stack, layout and local setup.
- `.gitignore` covering local secrets (`.env`) and private notes (`private-docs/`).
- `develop` branch as the integration branch; `master` tracks released history.

[Unreleased]: https://github.com/AlexTrinityBlock/inward-note-vault/compare/v0.1.0...develop
[0.1.0]: https://github.com/AlexTrinityBlock/inward-note-vault/releases/tag/v0.1.0

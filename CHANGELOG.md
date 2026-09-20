# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-20

First working release: the vault runs end to end on SQLite, with browser-side
encryption, folders and tags, Jev classification, and three UI languages.

### Added

**Storage and API**

- SQLite storage with Alembic migrations applied at start-up — no database
  server, and nothing to prepare before the first run.
- First-run setup that creates the owner account (scrypt password hash), cookie
  sessions stored only as token hashes, and login/logout.
- Notes split into two notebooks: plain notes stored as text and searchable,
  and end-to-end encrypted notes where the browser sends only AES-GCM ciphertext,
  so the server cannot read their title or body.
- Encrypted-notebook KDF profile (`salt`, `iterations`, verifier blob) that never
  receives the password or the derived key.
- Folder tree through a `parent_id` column, with cycle-proof moves and deletion
  that re-parents notes and subfolders instead of dropping them.
- Tags shared across both notebooks, with usage counts.
- One-click classification with Jev (TypeSafe System One): a folder `Choice` that
  always offers a "nothing fits" option, plus one `Noul` per candidate tag, all
  in a single request, with an explicit consent step before any decrypted text
  reaches TypeSafe.
- TypeSafe key storage in SQLite, write-only over the API, with an endpoint that
  verifies the key against TypeSafe.
- `operation_id`s on every route, so the generated client gets readable names.

**Client**

- First-run wizard, sign-in screen, and a session-aware shell.
- Folder tree, tag filters, note list, and a split Markdown editor with a
  sanitized live preview (`Ctrl/Cmd + S` saves).
- Browser-side notebook crypto: PBKDF2-SHA256 (600k iterations) → AES-GCM, with
  the key held in tab memory only, plus create, unlock and lock flows.
- Classification panel showing the folder suggestion and every tag probability;
  accept, adjust or dismiss. Encrypted notes show the consent warning first.
- Auto-classify setting: when enabled, a new note opens its classification panel
  straight away.
- English, Traditional Chinese and Simplified Chinese dictionaries with a locale
  switcher that remembers the choice.
- Orval-generated API client, committed so a fresh clone and the container build
  work without a running backend.

**Packaging**

- `uv run inward-note-vault`: one command that migrates, serves the API, and
  serves the built client, resolving the client per request so building it later
  works without a restart.
- `Dockerfile`: Bun builds the client, uv serves it, SQLite lives on `/data`.
- `docker-compose.yml` (single container on a named volume) and
  `docker-compose.dev.yml` (hot-reload API + Vite dev server).
- Backend, frontend and root READMEs, including the encryption model and what is
  deliberately left readable.

**Tests**

- 33 pytest cases: setup and sessions, the two notebooks' invariants, folders,
  tags, crypto parameters, classification (with a stand-in TypeSafe client), and
  SPA hosting.
- 12 `bun test` cases: real WebCrypto round-trips (unlock, wrong password,
  per-note nonces, cross-notebook isolation), folder tree helpers, and dictionary
  parity across the three locales.

### Changed

- Replaced the PostgreSQL driver with SQLite, so the app runs bare-metal with no
  external services; the compose stack went from three services to one container.
- Moved the Python project from the repository root into `backend/`.
- Split the project into `backend/` and `frontend/`, with the built client served
  by the API.

## [0.1.0] - 2026-09-20

### Added

- Initial project skeleton: `main.py` entry point and `pyproject.toml` (uv-managed, Python 3.14).
- `README.md` describing the stack, layout and local setup.
- `.gitignore` covering local secrets (`.env`) and private notes (`private-docs/`).
- `develop` branch as the integration branch; `master` tracks released history.

[0.2.0]: https://github.com/AlexTrinityBlock/inward-note-vault/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AlexTrinityBlock/inward-note-vault/releases/tag/v0.1.0

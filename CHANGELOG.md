# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Jev now chooses tags only from the vocabulary the user created. The shipped
  twelve-tag starter list is gone, so a fresh vault asks no tag questions at all
  instead of suggesting labels nobody asked for; the Tags panel is where the
  vocabulary is built.
- The Tags panel lists every tag with its note count, adds new ones, deletes
  them, and filters the note list; the filter chips moved there from the note
  list.

### Fixed

- The verify endpoint and the settings screen only looked at the key stored in
  the vault, so a working `TYPESAFE_API_KEY` from the environment was reported as
  "no key" even though classification used it. Both now resolve the key the same
  way classification does, and settings say where it came from.
- The container build failed on `uv sync`: building the project's metadata needs
  `README.md`, which the dependency layer had not copied yet. Dependencies and
  the project are now installed in two steps.
- The image had no trust store, so every HTTPS call to TypeSafe failed with
  `CERTIFICATE_VERIFY_FAILED`; `ca-certificates` is now installed.
- The development compose stack wrote a Linux `.venv` and `node_modules` into the
  bind-mounted source trees, overwriting the host's own installs. Both now live
  on named volumes.
- The generated API client returned error bodies as if they were successful
  data, so `isError` never fired, a 401 flowed into components as an object, and
  the vault crashed instead of showing the sign-in screen. Every request now
  goes through `src/client/http.ts`, which throws an `ApiError` carrying the
  server's `detail`.
- The encrypted-notebook provider was never mounted, so the workspace crashed on
  first render. It now wraps the vault route in `src/routes/router.tsx`.
- The classification panel re-asked Jev on every render, because its effect
  depended on a callback whose identity changed each time. It now asks at most
  once per note.
- Auto-classification ran when a note was created, spending a request on an
  empty note; it now runs once per note, after a save with content.
- The editor kept stale tag chips and folder selection after a change made
  elsewhere — applying Jev's suggestions updated the server but not the form.
  It now re-syncs whenever the note's `updated_at` moves, unless a draft is
  unsaved.
- A rejected TypeSafe key was reported as a *missing* key. The panel now shows
  what the server actually said: no key, the rate limit, or the upstream
  failure with its request id.

### Added

- Root launchers for the bare-metal path: `start.ps1`, `start.bat` (a shim onto
  the PowerShell script, so it can be double-clicked) and `start.sh`. Each
  checks for `uv`, builds the client with Bun only when `frontend/dist` is
  missing, syncs the backend, and forwards `--port`/`--reload` to the server.
- A per-account classification quota (10 requests per minute by default,
  `INWARD_CLASSIFY_REQUESTS_PER_MINUTE`) so a client bug cannot spend without
  bound; exceeding it returns 429.

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

# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-09-23

The interface is rebuilt around three tiers, and the "tag" concept is renamed to
"category" from the database through to the last translation string.

### Breaking

- **`tag` is now `category` everywhere.** The `tags` table is `categories` and
  `note_tags` is `note_categories` (column `tag_id` → `category_id`); the
  endpoints moved from `/api/tags` to `/api/categories`; the note and
  classification payloads carry `categories` instead of `tags`, and
  `tag_threshold` is now `category_threshold`. An existing API consumer, script
  or bookmark will need updating. An Alembic migration renames the tables and
  columns in place and has a matching `downgrade()`; test it against a copy of
  your database before upgrading.
- `GET /api/notes?tag=<name>` no longer filters. FastAPI ignores unknown query
  parameters, so the old spelling returns the **unfiltered** list rather than an
  error. Use `?category=<name>`.

### Added

- **Three tiers, on real routes.** `/` picks a notebook, `/n/:notebook` is the
  browser, `/n/:notebook/notes/:noteId` is one note on its own page, and
  `/n/:notebook/categories` manages categories. The old
  `/?notebook=encrypted` link redirects to `/n/encrypted`.
- A Drive-style browser: folder cards with subtree note counts, note cards or a
  sortable table, breadcrumbs, a sidebar directory with counts, a centre search
  field, and a grid/list toggle.
- A category management page built on the existing category table: rename,
  delete, create, and a drill-down into the notes that carry a category.
- Manual light/dark theme switching, remembered in `localStorage["inward.theme"]`
  and applied before the first paint so a dark-mode reload does not flash white.
- A toast provider and a promise-based confirm/prompt dialog, replacing the
  browser's own `confirm()` and `prompt()` in four places.
- A Markdown toolbar (bold, italic, H1–H3, quote, code, list, task, link, table)
  and an editor footer with word, character and reading-time statistics.
- The mobile drawer, the floating action button, and a read/write segmented
  control for the phone layout.

### Changed

- **`frontend/src/index.css` is gone.** Styling now lives in
  `frontend/src/styles/`: `tokens.css`, `base.css`, `layout.css`,
  `components.css`, plus `utilities.css` and `migration.css` for what the design
  source did not cover. The palette is the Vercel-style token set (`--canvas`,
  `--ink`, `--hairline`, `--shadow-level-1..5`).
- Geist and Geist Mono are loaded from Google Fonts with `preconnect`. They stay
  optional: an offline install falls back to the system stack, which keeps a CJK
  face ahead of the generic families because Geist has no Han glyphs.
- Screen state — folder, category, search text, sort and view mode — lives in the
  URL instead of component state, so a refresh lands where you were and the back
  button walks back through what you opened.
- Reading time and word count are counted per language: Latin words by
  whitespace, CJK glyphs individually. A whitespace split reported a Chinese
  paragraph as a single word.
- Entering edit mode asks for confirmation **once per note per visit**. The
  answer is remembered only for that note, is never persisted, and resets when
  you switch notes or leave the screen.
- The encrypted notebook's key is now held by a provider on the `/n/:notebook`
  layout, so it survives moving between the drive, a category and a note. It is
  still memory-only: a reload locks the notebook again.

### Fixed

- The editor counted words with `split(/\s+/)`, which reported a 500-character
  Chinese paragraph as one word and a reading time of zero minutes.

### Notes

- The classification consent step for encrypted notes is unchanged and still
  gates the one action that sends plaintext to TypeSafe.
- `conftest.py` builds tables from metadata, so pytest never exercises the
  migration path. Test the rename migration by hand against a database copy.

## [0.2.1] - 2026-09-20

The vault now samples long notes through Jev instead of truncating them, Jev
picks tags only from the vocabulary you built, the locked encrypted notebook is a
clean unlock page, and `docker compose` genuinely works.

### Changed

- A locked encrypted notebook now shows nothing but the unlock prompt: the
  folders, the tag panel, the note list and the editor are not rendered, and the
  notes are not even requested from the server until the browser holds the key.
- Which notebook is open now lives in the URL (`/?notebook=encrypted`) instead
  of component state, so a refresh stays in the encrypted notebook and lands on
  the unlock page — the key itself is still memory-only. The view is
  bookmarkable, and switching tabs replaces the history entry rather than
  stacking one.
- Long notes are no longer truncated: the text is cut into consecutive windows
  of 10,000 characters (`INWARD_CLASSIFY_WINDOW_CHARS`), each window is
  classified, and the answers are averaged — tags average their probabilities,
  and the folder averages its whole option distribution before a winner is
  taken. A window that fails is skipped and reported; if every window fails the
  request is a 502.
- Vault limits are now explicit: at most 200 tags, each name at most 50
  characters, enforced on the tag endpoints *and* on tags added through a note.
  The classification spend cap counts windows, so a long note reserves its
  requests up front and is refused with a 429 rather than stopping halfway.
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

[0.2.1]: https://github.com/AlexTrinityBlock/inward-note-vault/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/AlexTrinityBlock/inward-note-vault/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/AlexTrinityBlock/inward-note-vault/releases/tag/v0.1.0

# Inward Note Vault — frontend

React + TypeScript client for the vault, built with Vite and managed with
[Bun](https://bun.sh). API hooks are generated from the backend's OpenAPI schema
with [Orval](https://orval.dev) and committed, so a fresh clone builds without a
running server.

## Features

- **Three tiers, on real routes.** `/` picks a notebook, `/n/:notebook` is the
  Drive-style browser, `/n/:notebook/categories` manages categories, and
  `/n/:notebook/notes/:noteId` is one note on its own page. Every screen is
  linkable; the old `/?notebook=encrypted` link still redirects to
  `/n/encrypted`.
- **Two notebooks.** Plain notes are stored as text; encrypted notes are sealed
  in the browser (PBKDF2 → AES-GCM) and the server only ever holds ciphertext.
- **A Drive-style browser.** Folder cards, note cards or a sortable table, a
  sidebar directory, breadcrumbs, a centre search field and a grid/list toggle.
  Folder, category, search text, sort and view mode live in the URL, so a refresh
  lands where the reader was. Search runs on the server for plain notes; for the
  encrypted notebook it runs in the browser over the decrypted notes, because the
  server has nothing readable to match against. The field says which.
- **Categories, not tags.** Categories are shared by both notebooks and capped at
  200, with 50 characters per name. The category page is built on the same table
  the note picker uses.
- **Editor and preview.** A note opens rendered. Entering edit mode asks once per
  note per visit, then splits the page into Markdown on the left and the preview
  on the right, with a Markdown toolbar and `Ctrl/Cmd + S` to save. The footer
  counts words, characters and reading time, counting Latin words by whitespace
  and CJK glyphs individually — a whitespace split reports a whole Chinese
  paragraph as one word.
- **One-click classification.** Jev suggests a folder and categories; encrypted
  notes ask for consent first, because that is the one action that sends their
  text to TypeSafe.
- **Dialogs and toasts, not browser popups.** Every confirmation and prompt goes
  through `DialogProvider`, which is styled and translated, and every result is
  reported by `ToastProvider`. Nothing calls `window.confirm` or `window.prompt`.
- **Three locales.** English, 繁體中文 and 简体中文, remembered per browser.

## Layout

```
frontend/src/
├── client/generated/   # orval output: typed React Query hooks and models
├── components/         # shell, dialogs, toasts, editor pieces, classification
│   └── drive/          # the browser's own pieces: sidebar, breadcrumbs, grids
├── hooks/              # URL-driven drive state, edit mode, theme, notebook key
├── i18n/               # dictionaries + provider (en, zh-TW, zh-CN)
├── lib/                # WebCrypto crypto, folder tree, Markdown, stats, limits
├── routes/             # router, portal, drive layout, category, note, settings
├── styles/             # tokens, base, layout, components, utilities, migration
└── main.tsx
```

The router is the map of the app: `router.tsx` declares the route tree, and
`DriveLayout.tsx` is the frame the drive, the category page and the note share —
the header and the sidebar. The unlocked notebook key is held higher up, in
`AppGate`'s `EncryptedNotebookProvider`, because every screen's header shows the
lock control.

Styling is the Vercel-style token set in `styles/tokens.css` (`--canvas`, `--ink`,
`--hairline`, `--shadow-level-1..5`): the light palette on `:root`, the dark one
on `[data-theme="dark"]`. `base.css`, `layout.css` and `components.css` are
ported from a local design template that is not part of the repository;
`utilities.css` and `migration.css` cover what it did not. `main.tsx` imports the
six in that order. Geist and Geist Mono are loaded from Google Fonts with
`preconnect` in `index.html`, and stay optional: an offline install falls through
to the system stack, which keeps a CJK face ahead of the generic families because
Geist has no Han glyphs. The theme is switched by hand, remembered in
`localStorage["inward.theme"]` and written to `<html data-theme>`; the same
resolution runs inline in `index.html` before the first paint so a dark-mode
reload never flashes white. The favicon is `public/icon.svg`.

## Run it

```bash
bun install
bun run dev          # http://localhost:5173, proxies /api and /health to the backend
```

Scripts: `bun run build`, `bun run preview`, `bun run typecheck`, `bun test`,
`bun run api:generate`, `bun run api:watch`.

**`dist/` is committed.** The API serves `frontend/dist` directly, and the
launchers and the Docker image both use the checked-out bundle, so installing the
vault needs only `uv` — no Bun, no build step. That makes `bun run build` part of
the change you commit: after editing anything under `src/`, rebuild and include
the new `dist/` in the same commit, or the served client will not match the
source. `bun test` includes a render smoke test
(`src/routes/router.test.tsx`) that mounts every route in a DOM, which is what
catches a hook used outside its provider.

## Regenerating the API client

```bash
# no argument: fetches the schema from a running backend
# (http://127.0.0.1:8000/openapi.json)
bun run api:generate

# or point it at a schema file, or at any other URL
bun run api:generate ./path/to/openapi.json
VITE_OPENAPI_SPEC=http://127.0.0.1:9000/openapi.json bun run api:generate
```

`api:generate` runs `scripts/generate-client.mjs`, which calls Orval's
programmatic `generate()` rather than the Orval CLI: the CLI loads
`orval.config.ts` through `jiti`, and that spawns a child process, which fails
under a restricted sandbox. The script keeps its own copy of the project
options, so the two have to be changed together. `api:watch` still goes through
the CLI and still reads `VITE_OPENAPI_SPEC`.

Generated files live in `src/client/generated` and are committed. Hook names come
from the backend's `operation_id`s (for example `useListNotes`).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Backend the dev server proxies `/api` and `/health` to |
| `VITE_OPENAPI_SPEC` | `http://127.0.0.1:8000/openapi.json` | Schema `api:generate` and the Orval CLI (`api:watch`) read |

Only `VITE_`-prefixed values reach the browser, so never put secrets here — the
TypeSafe API key stays in the backend.

## Tests

```bash
bun test
```

Covers the notebook crypto with real WebCrypto (unlock, wrong password, per-note
nonces, cross-notebook isolation), the folder tree helpers, the Markdown snippet
and toolbar edits, the word/character/reading-time counters, and that all three
dictionaries stay in sync.

## Crypto notes

`src/lib/crypto.ts` derives an AES-GCM key from the notebook password with
PBKDF2-SHA256 (600,000 iterations, 16-byte salt). `EncryptedNotebookProvider`
holds the key in React state for the tab's lifetime — never in `localStorage`,
`sessionStorage` or a cookie — so reloading the page locks the notebook. It is
mounted on the `/n/:notebook` layout, which is why the key survives moving
between the drive, the category page and a note. The server stores the salt, the
iteration count and a verifier blob (`/api/crypto/profile`) so the same password
opens the notebook in any browser.

What is *not* encrypted: note ids, timestamps, folder membership, and category
names. The server needs those to build the tree, filters and search.

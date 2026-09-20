# Inward Note Vault — frontend

React + TypeScript client for the vault, built with Vite and managed with
[Bun](https://bun.sh). API hooks are generated from the backend's OpenAPI schema
with [Orval](https://orval.dev) and committed, so a fresh clone builds without a
running server.

## Features

- **Two notebooks.** Plain notes are stored as text; encrypted notes are sealed
  in the browser (PBKDF2 → AES-GCM) and the server only ever holds ciphertext.
- **Editor and preview.** Write Markdown on the left, read the rendered result
  on the right. `Ctrl/Cmd + S` saves.
- **Folders and tags.** The `parent_id` tree, tag chips, and client-side folder
  subtree filtering.
- **One-click classification.** Jev suggests a folder and tags; encrypted notes
  ask for consent first, because that is the one action that sends their text to
  TypeSafe.
- **Three locales.** English, 繁體中文 and 简体中文, remembered per browser.

## Layout

```
frontend/src/
├── client/generated/   # orval output: typed React Query hooks and models
├── components/         # shell, folders, notes, editor, classification, dialogs
├── hooks/              # encrypted-notebook key state, note decryption
├── i18n/               # dictionaries + provider (en, zh-TW, zh-CN)
├── lib/                # WebCrypto notebook crypto, folder tree helpers
├── routes/             # router, vault workspace, settings
└── main.tsx
```

## Run it

```bash
bun install
bun run dev          # http://localhost:5173, proxies /api and /health to the backend
```

Scripts: `bun run build`, `bun run preview`, `bun run typecheck`, `bun test`,
`bun run api:generate`, `bun run api:watch`.

In production the client is served by the API itself (`frontend/dist`), so
`bun run build` is all a bare-metal install needs.

## Regenerating the API client

```bash
# backend running on http://127.0.0.1:8000
bun run api:generate

# or against a saved schema
VITE_OPENAPI_SPEC=./openapi.json bun run api:generate
```

Generated files live in `src/client/generated` and are committed. Hook names come
from the backend's `operation_id`s (for example `useListNotes`).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Backend the dev server proxies to |
| `VITE_OPENAPI_SPEC` | `http://127.0.0.1:8000/openapi.json` | Schema Orval generates from |

Only `VITE_`-prefixed values reach the browser, so never put secrets here — the
TypeSafe API key stays in the backend.

## Tests

```bash
bun test
```

Covers the notebook crypto with real WebCrypto (unlock, wrong password, per-note
nonces, cross-notebook isolation), the folder tree helpers, and that all three
dictionaries stay in sync.

## Crypto notes

`src/lib/crypto.ts` derives an AES-GCM key from the notebook password with
PBKDF2-SHA256 (600,000 iterations, 16-byte salt). The key lives in React state
for the tab's lifetime — never in `localStorage`, `sessionStorage` or a cookie —
so reloading the page locks the notebook. The server stores the salt, the
iteration count and a verifier blob (`/api/crypto/profile`) so the same password
opens the notebook in any browser.

What is *not* encrypted: note ids, timestamps, folder membership, and tag names.
The server needs those to build the tree, filters and search.

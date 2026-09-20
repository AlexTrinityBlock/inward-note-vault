# Inward Note Vault — frontend

React + TypeScript client, built with Vite and managed with [Bun](https://bun.sh).
API types and hooks are generated from the backend's OpenAPI schema with
[Orval](https://orval.dev).

## Layout

```
frontend/
├── src/
│   ├── client/        # Orval output (generated/) plus hand-written HTTP helpers
│   ├── components/    # shared presentational components
│   ├── hooks/         # hand-written React hooks
│   ├── routes/        # router and route components
│   ├── main.tsx       # entry point (QueryClientProvider + RouterProvider)
│   └── index.css
├── orval.config.ts
├── vite.config.ts
└── package.json
```

## Run it

```bash
bun install
bun run dev          # http://localhost:5173, proxies /api and /health to the backend
```

Other scripts: `bun run build`, `bun run preview`, `bun run typecheck`,
`bun run api:generate` (see `src/client/README.md`).

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_PROXY_TARGET` | `http://127.0.0.1:8000` | Backend the dev server proxies to |
| `VITE_OPENAPI_SPEC` | `http://127.0.0.1:8000/openapi.json` | Schema Orval generates from |

Only `VITE_`-prefixed values reach the browser, so never put secrets here — the
TypeSafe API key stays in the backend.

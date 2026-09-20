# API client

`generated/` holds the Orval output: typed React Query hooks and models derived
from the backend's OpenAPI schema. It is not committed — regenerate it instead:

```bash
# backend running on http://127.0.0.1:8000
bun run api:generate
```

Point Orval at another schema with `VITE_OPENAPI_SPEC`, and override the dev
proxy target with `VITE_API_PROXY_TARGET` (see `vite.config.ts`).

Hand-written HTTP helpers shared by the generated client belong in this
directory, next to `generated/`.

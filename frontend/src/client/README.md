# API client

`generated/` is Orval output: typed React Query hooks and models derived from the
backend's OpenAPI schema. It is committed so that a fresh clone, and the
container build, work without a running API.

Regenerate it after changing the API:

```bash
# backend running on http://127.0.0.1:8000
bun run api:generate

# or against a saved schema
VITE_OPENAPI_SPEC=./openapi.json bun run api:generate
```

Hook names come from the backend's `operation_id`s, so `GET /api/notes` becomes
`useListNotes()`, `POST /api/notes/{id}/classify` becomes `useClassifyNote()`, and
so on. Responses resolve to the payload itself (no `{ status, data }` wrapper),
and mutations take `{ data }` or `{ noteId, data }` variables.

Hand-written HTTP helpers shared by the generated client belong in this
directory, next to `generated/`.

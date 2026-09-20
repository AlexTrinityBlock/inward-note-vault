# syntax=docker/dockerfile:1

# --- client: build the SPA -------------------------------------------------
FROM oven/bun:1-alpine AS client

WORKDIR /client
COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY frontend/ ./
RUN bun run build

# --- runtime: the API serves the client ------------------------------------
FROM ghcr.io/astral-sh/uv:bookworm-slim AS runtime

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_FROZEN=1 \
    INWARD_DATA_DIR=/data

WORKDIR /app/backend

# Dependencies first, so the layer is cached across source edits.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/ ./
# `/app/frontend/dist` is where the app looks for the built client.
COPY --from=client /client/dist /app/frontend/dist

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "inward-note-vault", "--host", "0.0.0.0", "--port", "8000"]

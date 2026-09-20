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

# The slim base has no trust store, so HTTPS calls (the TypeSafe API) fail
# certificate verification without this.
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so the layer survives source edits. The project itself is
# installed in the next step: building its metadata needs the README, which is
# not copied yet.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
RUN uv sync --frozen --no-dev

# `/app/frontend/dist` is where the app looks for the built client.
COPY --from=client /client/dist /app/frontend/dist

RUN mkdir -p /data
VOLUME ["/data"]

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "inward-note-vault", "--host", "0.0.0.0", "--port", "8000"]

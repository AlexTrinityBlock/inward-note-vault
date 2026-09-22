#!/usr/bin/env sh
# Prepare the environment and serve the vault.
#
#   ./start.sh
#   ./start.sh --port 9000 --reload
#
# The built client is committed, so this needs nothing but `uv`. Bun is only
# required by someone editing the frontend.
#
# Secrets are read from `.env` (or `backend/.env`), and the database lives in
# `backend/data/vault.db` unless INWARD_DATA_DIR says otherwise.
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$root"

if ! command -v uv >/dev/null 2>&1; then
    echo "'uv' is not installed. Get it from https://docs.astral.sh/uv/ and run this again." >&2
    exit 1
fi

# The bundle ships with the repository, so this only trips on a partial checkout
# or after someone deleted it while working on the frontend.
if [ ! -f frontend/dist/index.html ]; then
    echo "The web client is missing from 'frontend/dist'." >&2
    echo "It is committed, so try 'git checkout -- frontend/dist' first." >&2
    echo 'To rebuild it after changing the frontend, install Bun from https://bun.sh:' >&2
    echo '    cd frontend && bun install && bun run build' >&2
    exit 1
fi

# Report the port the server will actually use, so `--port 9000` is not
# contradicted by the banner.
port=8000
previous=''
for argument in "$@"; do
    if [ "$previous" = '--port' ]; then
        port=$argument
    fi
    previous=$argument
done

echo 'Preparing the backend environment...'
uv sync --directory backend

echo "Serving Inward Note Vault on http://127.0.0.1:$port (Ctrl+C stops it)."
exec uv run --directory backend inward-note-vault "$@"

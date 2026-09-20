# inward-note-vault

Personal note vault service — an inward-facing place to capture, classify and retrieve notes.

> Status: early skeleton (v0.1.0). The repository currently contains the project scaffolding only.

## Tech stack

- **Python 3.14**, packaged and managed with [uv](https://docs.astral.sh/uv/)
- **typesafe-sdk** for structured LLM classification of note content
- Planned: FastAPI backend (`backend/`) and a Vite + React frontend (`frontend/`)

## Getting started

```bash
# install dependencies
uv sync

# run the entry point
uv run main.py
```

## Configuration

Local secrets live in `.env` (ignored by git). Copy the keys you need and fill in your own values:

```
TYPESAFE_API_KEY=...
```

## Repository layout

| Path             | Purpose                                            |
| ---------------- | -------------------------------------------------- |
| `main.py`        | Python entry point                                 |
| `pyproject.toml` | Project metadata and dependencies                  |
| `private-docs/`  | Local notes, never committed (see `.gitignore`)    |
| `backend/`       | FastAPI service (planned)                          |
| `frontend/`      | Vite + React client (planned)                      |

## Versioning

Development happens on `develop`; `master` tracks released history. Releases are tagged `vX.Y.Z`.

## License

MIT — see [LICENSE](LICENSE).

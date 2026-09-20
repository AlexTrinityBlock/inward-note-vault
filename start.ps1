#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Build the web client if needed, prepare the environment, and serve the vault.

.DESCRIPTION
    The bare-metal path in one step:
      1. fails fast when `uv` is missing,
      2. builds `frontend/dist` with Bun when the client has not been built yet,
      3. syncs the backend environment,
      4. serves the API and the client on http://127.0.0.1:8000.

    Secrets are read from `.env` (or `backend/.env`), and the database lives in
    `backend/data/vault.db` unless INWARD_DATA_DIR says otherwise.

.EXAMPLE
    ./start.ps1
    ./start.ps1 --port 9000 --reload
#>
[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]] $ServerArgs
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Stop-WithMessage {
    param([string] $Message)
    Write-Host $Message -ForegroundColor Red
    exit 1
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    Stop-WithMessage "'uv' is not installed. Get it from https://docs.astral.sh/uv/ and run this again."
}

if (-not (Test-Path 'frontend/dist/index.html')) {
    if (Get-Command bun -ErrorAction SilentlyContinue) {
        Write-Host 'Building the web client (first run only)...' -ForegroundColor Cyan
        Push-Location 'frontend'
        try {
            bun install
            if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'bun install failed.' }
            bun run build
            if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'bun run build failed.' }
        }
        finally {
            Pop-Location
        }
    }
    else {
        Stop-WithMessage @"
The web client is not built and 'bun' is not installed.
Install Bun from https://bun.sh, then run:
    cd frontend; bun install; bun run build
"@
    }
}

# Report the port the server will actually use, so `--port 9000` is not
# contradicted by the banner.
$port = '8000'
for ($index = 0; $index -lt $ServerArgs.Count - 1; $index++) {
    if ($ServerArgs[$index] -eq '--port') { $port = $ServerArgs[$index + 1] }
}

Write-Host 'Preparing the backend environment...' -ForegroundColor Cyan
uv sync --directory backend
if ($LASTEXITCODE -ne 0) { Stop-WithMessage 'uv sync failed.' }

Write-Host "Serving Inward Note Vault on http://127.0.0.1:$port (Ctrl+C stops it)." -ForegroundColor Green
uv run --directory backend inward-note-vault @ServerArgs

#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Prepare the environment and serve the vault.

.DESCRIPTION
    The bare-metal path in one step:
      1. fails fast when `uv` is missing,
      2. checks that the web client is present,
      3. syncs the backend environment,
      4. serves the API and the client on http://127.0.0.1:8000.

    The built client is committed, so this needs nothing but `uv`. Bun is only
    required by someone editing the frontend.

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

# The bundle ships with the repository, so this only trips on a partial checkout
# or after someone deleted it while working on the frontend.
if (-not (Test-Path 'frontend/dist/index.html')) {
    Stop-WithMessage @"
The web client is missing from 'frontend/dist'.
It is committed, so try 'git checkout -- frontend/dist' first.
To rebuild it after changing the frontend, install Bun from https://bun.sh:
    cd frontend; bun install; bun run build
"@
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

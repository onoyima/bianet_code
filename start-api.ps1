$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Load vars from .env if not already set
Get-Content "$projectRoot\.env" | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.+)\s*$') {
    $key = $matches[1].Trim()
    $val = $matches[2].Trim()
    if (-not (Test-Path "env:$key")) {
      Set-Item -Path "env:$key" -Value $val
    }
  }
}

# Set defaults if still missing
if (-not $env:DATABASE_URL) { $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/bianet" }
if (-not $env:JWT_SECRET) { $env:JWT_SECRET = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }
if (-not $env:JWT_REFRESH_SECRET) { $env:JWT_REFRESH_SECRET = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }
if (-not $env:PORT) { $env:PORT = "8080" }
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
if (-not $env:ALLOWED_ORIGINS) { $env:ALLOWED_ORIGINS = "http://localhost:5173" }

Write-Host "Starting API server on port $env:PORT ..."

# Build then run
Push-Location $projectRoot
node server/build.mjs
if ($?) {
  node --enable-source-maps server/dist/index.mjs
}
Pop-Location

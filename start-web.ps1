$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $env:PORT) { $env:PORT = "5173" }
if (-not $env:BASE_PATH) { $env:BASE_PATH = "/" }

Write-Host "Starting web frontend on port $env:PORT ..."

Push-Location $projectRoot
node node_modules/vite/bin/vite.js --config web/vite.config.ts --host 0.0.0.0
Pop-Location
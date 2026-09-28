# start_all.ps1
# Launches all four Sentinel AI agents, each in its own PowerShell window.
# Run setup_all.ps1 first if you haven't already.
# Usage:  powershell -ExecutionPolicy Bypass -File start_all.ps1

$root = Get-Location

Write-Host "=== Starting Sentinel AI agents ===" -ForegroundColor Cyan

# Report Agent - port 8004
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root'; .\venv\Scripts\Activate.ps1; Write-Host 'REPORT AGENT (8004)' -ForegroundColor Magenta; uvicorn report_service:app --host 0.0.0.0 --port 8004"
)

# File Scanner Agent - port 8005
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\file-scanner-agent'; .\venv\Scripts\Activate.ps1; Write-Host 'FILE SCANNER AGENT (8005)' -ForegroundColor Magenta; uvicorn scanner_service:app --host 0.0.0.0 --port 8005"
)

# Process Monitor Agent - port 8006
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\process-monitor-agent'; .\venv\Scripts\Activate.ps1; Write-Host 'PROCESS MONITOR AGENT (8006)' -ForegroundColor Magenta; uvicorn process_monitor_service:app --host 0.0.0.0 --port 8006"
)

# Response Agent - port 8007 (simulate mode by default - SAFE)
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\response-agent'; .\venv\Scripts\Activate.ps1; `$env:RESPONSE_MODE='simulate'; Write-Host 'RESPONSE AGENT (8007) - SIMULATE MODE' -ForegroundColor Magenta; uvicorn response_service:app --host 0.0.0.0 --port 8007"
)

# File Search Agent - port 8008
Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "cd '$root\file-search-agent'; .\venv\Scripts\Activate.ps1; Write-Host 'FILE SEARCH AGENT (8008)' -ForegroundColor Magenta; uvicorn search_service:app --host 0.0.0.0 --port 8008"
)

# Auth Backend - port 8009 (Node.js, not Python - no venv activation)
if (Test-Path "$root\auth-backend\.env") {
    Start-Process powershell -ArgumentList @(
        "-NoExit", "-Command",
        "cd '$root\auth-backend'; Write-Host 'AUTH BACKEND (8009)' -ForegroundColor Magenta; npm start"
    )
} else {
    Write-Host ""
    Write-Host "Skipping auth-backend - auth-backend\.env not found. Run setup_all.ps1 first, edit the .env it creates, then run start_all.ps1 again." -ForegroundColor Red
}

Write-Host ""
Write-Host "All agents launching in separate windows." -ForegroundColor Green
Write-Host "Wait ~5 seconds, then run test_pipeline.ps1 to verify." -ForegroundColor Green
Write-Host ""
Write-Host "Response Agent is in SIMULATE mode (safe - no real system changes)." -ForegroundColor Yellow
Write-Host "To go live: edit response-agent's window and restart with `$env:RESPONSE_MODE='live'" -ForegroundColor Yellow
Write-Host ""
Write-Host "Frontend is separate - run 'npm run dev' in frontend\ to start the dashboard." -ForegroundColor Yellow

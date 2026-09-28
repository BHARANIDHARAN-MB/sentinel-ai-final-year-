# rebuild_venvs.ps1
# Deletes the partially-broken virtual environments from the failed
# pydantic-core build and recreates them cleanly with relaxed version
# pins that have pre-built wheels for newer Python versions (like 3.14).
# Usage:  powershell -ExecutionPolicy Bypass -File rebuild_venvs.ps1

Write-Host "=== Rebuilding virtual environments ===" -ForegroundColor Cyan

$agents = @(".", "file-scanner-agent", "process-monitor-agent", "response-agent")

foreach ($agent in $agents) {
    $label = if ($agent -eq ".") { "report-agent" } else { $agent }
    Write-Host ""
    Write-Host "--- $label ---" -ForegroundColor Yellow

    Push-Location $agent

    if (Test-Path "venv") {
        Write-Host "Removing old venv..."
        Remove-Item -Recurse -Force "venv"
    }

    Write-Host "Creating fresh virtual environment..."
    python -m venv venv

    Write-Host "Installing dependencies..."
    .\venv\Scripts\pip.exe install --upgrade pip --quiet
    .\venv\Scripts\pip.exe install -r requirements.txt

    if ($LASTEXITCODE -ne 0) {
        Write-Host "$label FAILED - see errors above." -ForegroundColor Red
        Pop-Location
        continue
    }

    if ($agent -eq ".") {
        Write-Host "Installing Node dependencies (docx)..."
        npm install
    }

    Pop-Location
    Write-Host "$label rebuilt successfully." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Rebuild complete. Run start_all.ps1 next. ===" -ForegroundColor Cyan

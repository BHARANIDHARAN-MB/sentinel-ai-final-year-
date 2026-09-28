# setup_all.ps1
# Run this ONCE from the sentinel-ai root folder to set up all five agents.
# The frontend (React/Vite) is set up separately - see frontend/FRONTEND_README.md
# Usage:  powershell -ExecutionPolicy Bypass -File setup_all.ps1

Write-Host "=== Sentinel AI - Setting up all agents ===" -ForegroundColor Cyan

$agents = @("report-agent", "file-scanner-agent", "process-monitor-agent", "response-agent", "file-search-agent")

foreach ($agent in $agents) {
    Write-Host ""
    Write-Host "--- Setting up $agent ---" -ForegroundColor Yellow

    if ($agent -eq "report-agent") {
        $path = "."
    } else {
        $path = $agent
    }

    Push-Location $path

    if (-Not (Test-Path "venv")) {
        Write-Host "Creating virtual environment..."
        python -m venv venv
    }

    Write-Host "Installing Python dependencies..."
    .\venv\Scripts\pip.exe install -r requirements.txt --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "$agent FAILED - pip install returned an error (see output above)." -ForegroundColor Red
        Pop-Location
        continue
    }

    if ($agent -eq "report-agent") {
        Write-Host "Installing Node dependencies (docx)..."
        npm install --silent
        if ($LASTEXITCODE -ne 0) {
            Write-Host "$agent FAILED - npm install returned an error." -ForegroundColor Red
            Pop-Location
            continue
        }
    }

    Pop-Location
    Write-Host "$agent ready." -ForegroundColor Green
}

Write-Host ""
Write-Host "--- Setting up auth-backend (Node.js) ---" -ForegroundColor Yellow
Push-Location auth-backend
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Host "auth-backend FAILED - npm install returned an error." -ForegroundColor Red
} else {
    if (-Not (Test-Path ".env")) {
        Copy-Item ".env.example" ".env"
        Write-Host "Created auth-backend\.env from the template - EDIT IT before running start_all.ps1:" -ForegroundColor Red
        Write-Host "  - MONGODB_URI (your MongoDB Atlas connection string)" -ForegroundColor Red
        Write-Host "  - JWT_SECRET  (generate with: node -e ""console.log(require('crypto').randomBytes(32).toString('hex'))""))" -ForegroundColor Red
        Write-Host "  - RESEND_API_KEY (optional for local dev - OTPs print to console without it)" -ForegroundColor Red
    }
    Write-Host "auth-backend ready." -ForegroundColor Green
}
Pop-Location

Write-Host ""
Write-Host "=== All agents set up. Run start_all.ps1 next. ===" -ForegroundColor Cyan

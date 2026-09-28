# restart_all.ps1
# Stops any running agents on ports 8004-8007 and starts them fresh -
# use this any time you've edited code and need the new version running.
# Usage:  powershell -ExecutionPolicy Bypass -File restart_all.ps1

Write-Host "=== Stopping any running agents ===" -ForegroundColor Cyan
foreach ($port in 8004, 8005, 8006, 8007, 8008, 8009) {
    $conn = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($conn) {
        Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
        Write-Host "  Stopped process on port $port" -ForegroundColor Yellow
    }
}
Start-Sleep -Seconds 2

Write-Host ""
Write-Host "=== Starting all agents fresh ===" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File start_all.ps1

Write-Host ""
Write-Host "Waiting 5 seconds for agents to boot..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "=== Verifying ===" -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File test_pipeline.ps1

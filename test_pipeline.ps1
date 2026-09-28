# test_pipeline.ps1
# Verifies all four agents are running, then runs one real end-to-end
# scan -> report cycle so you can see the whole pipeline work.
# Usage:  powershell -ExecutionPolicy Bypass -File test_pipeline.ps1

Write-Host "=== Checking all agents are alive ===" -ForegroundColor Cyan

$agents = @(
    @{ Name = "Report Agent";          Port = 8004 },
    @{ Name = "File Scanner Agent";    Port = 8005 },
    @{ Name = "Process Monitor Agent"; Port = 8006 },
    @{ Name = "Response Agent";        Port = 8007 },
    @{ Name = "File Search Agent";     Port = 8008 },
    @{ Name = "Auth Backend";          Port = 8009 }
)

$allUp = $true
foreach ($a in $agents) {
    try {
        $res = Invoke-RestMethod -Uri "http://localhost:$($a.Port)/health" -TimeoutSec 5
        Write-Host "  [OK] $($a.Name) (port $($a.Port)) - $($res.status)" -ForegroundColor Green
    } catch {
        Write-Host "  [FAIL] $($a.Name) (port $($a.Port)) - not responding" -ForegroundColor Red
        $allUp = $false
    }
}

if (-Not $allUp) {
    Write-Host ""
    Write-Host "Not all agents are up. Run start_all.ps1 and wait a few seconds, then retry." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "=== Running a real end-to-end pipeline test ===" -ForegroundColor Cyan

Write-Host "1. Scanning your real Downloads/Desktop/Temp folders..." -ForegroundColor Yellow
$fileScan = Invoke-RestMethod -Uri "http://localhost:8005/scan-common-folders" -Method POST
Write-Host "   Scanned $($fileScan.files_scanned) files, $($fileScan.files_flagged) flagged."

Write-Host "2. Scanning your real running processes..." -ForegroundColor Yellow
$procScan = Invoke-RestMethod -Uri "http://localhost:8006/scan-processes?cpu_sample_seconds=1" -Method GET
Write-Host "   Scanned $($procScan.total_processes) processes, $($procScan.processes_flagged) flagged."

Write-Host "3. Generating an incident report from the sample incident data..." -ForegroundColor Yellow
Invoke-WebRequest -Uri "http://localhost:8004/generate-report" `
    -Method POST -ContentType "application/json" `
    -InFile "sample_incident.json" -OutFile "pipeline_test_report.docx" | Out-Null
Write-Host "   Report saved to pipeline_test_report.docx"

Write-Host "4. Testing file search (searching for 'resume' as a sample query)..." -ForegroundColor Yellow
$searchResult = Invoke-RestMethod -Uri "http://localhost:8008/search-file" -Method POST `
    -ContentType "application/json" -Body '{"query": "resume"}'
Write-Host "   Scanned $($searchResult.files_scanned) files, found $($searchResult.results.Count) match(es)."

Write-Host "5. Testing chat assistant..." -ForegroundColor Yellow
$chatResult = Invoke-RestMethod -Uri "http://localhost:8004/chat" -Method POST `
    -ContentType "application/json" -Body '{"message": "hello"}'
Write-Host "   Assistant replied: $($chatResult.reply)"

Write-Host ""
Write-Host "=== Pipeline test complete. Open pipeline_test_report.docx to check the output. ===" -ForegroundColor Cyan

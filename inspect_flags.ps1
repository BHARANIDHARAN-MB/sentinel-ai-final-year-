# inspect_flags.ps1
# Pulls the full flagged-files and flagged-processes lists so you can see
# exactly what triggered each flag, not just the summary counts.
# Usage:  powershell -ExecutionPolicy Bypass -File inspect_flags.ps1

Write-Host "=== Fetching flagged files ===" -ForegroundColor Cyan
$fileScan = Invoke-RestMethod -Uri "http://localhost:8005/scan-common-folders" -Method POST

Write-Host "Total scanned: $($fileScan.files_scanned)  |  Flagged: $($fileScan.files_flagged)  |  Signature-cleared: $($fileScan.signature_cleared)" -ForegroundColor Yellow
Write-Host ""

if ($fileScan.signature_cleared -gt 0) {
    Write-Host "--- Cleared via trusted digital signature (not treated as threats) ---" -ForegroundColor Green
    $fileScan.signature_cleared_files | ForEach-Object {
        Write-Host "  $($_.path)"
    }
    Write-Host ""
}

# Save full detail to a file for deep review
$fileScan | ConvertTo-Json -Depth 5 | Out-File "flagged_files_full.json"
Write-Host "Full detail saved to flagged_files_full.json" -ForegroundColor Green
Write-Host ""

# Breakdown by reason, so you can see how much is entropy-only noise
# vs. genuinely suspicious combinations
Write-Host "--- Breakdown by trigger reason ---" -ForegroundColor Cyan
$reasonCounts = @{}
foreach ($f in $fileScan.flagged_files) {
    foreach ($r in $f.reasons) {
        $key = $r.Substring(0, [Math]::Min(40, $r.Length))
        if ($reasonCounts.ContainsKey($key)) { $reasonCounts[$key]++ } else { $reasonCounts[$key] = 1 }
    }
}
$reasonCounts.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object {
    Write-Host "  $($_.Value)x  $($_.Key)..."
}
Write-Host ""

# How many were flagged by ONLY the entropy check (most likely false positives -
# a real threat usually also trips location or naming heuristics too)
$entropyOnly = $fileScan.flagged_files | Where-Object {
    $_.reasons.Count -eq 1 -and $_.reasons[0] -like "*entropy*"
}
Write-Host "Flagged by entropy ALONE (likely false positives - packed installers): $($entropyOnly.Count)" -ForegroundColor Yellow

$multiSignal = $fileScan.flagged_files | Where-Object { $_.reasons.Count -ge 2 }
Write-Host "Flagged by 2+ signals (worth actually checking): $($multiSignal.Count)" -ForegroundColor Red
Write-Host ""

if ($multiSignal.Count -gt 0) {
    Write-Host "--- Files flagged by multiple signals (review these first) ---" -ForegroundColor Red
    $multiSignal | ForEach-Object {
        Write-Host "  $($_.path)  [risk=$($_.risk_score)]"
        $_.reasons | ForEach-Object { Write-Host "      - $_" }
    }
}

Write-Host ""
Write-Host "=== Fetching flagged processes ===" -ForegroundColor Cyan
$procScan = Invoke-RestMethod -Uri "http://localhost:8006/scan-processes?cpu_sample_seconds=2"

Write-Host "Total scanned: $($procScan.total_processes)  |  Flagged: $($procScan.processes_flagged)  |  Signature-cleared: $($procScan.signature_cleared)" -ForegroundColor Yellow
Write-Host ""

if ($procScan.signature_cleared -gt 0) {
    Write-Host "--- Cleared via trusted digital signature (not treated as threats) ---" -ForegroundColor Green
    $procScan.signature_cleared_processes | ForEach-Object {
        Write-Host "  PID $($_.pid) | $($_.name) | $($_.exe)"
    }
    Write-Host ""
}

if ($procScan.processes_flagged -gt 0) {
    $procScan.flagged_processes | ForEach-Object {
        Write-Host "PID $($_.pid) | $($_.name) | risk=$($_.risk_score) | cpu=$($_.cpu_percent)%"
        Write-Host "  exe: $($_.exe)"
        $_.reasons | ForEach-Object { Write-Host "  - $_" }
        Write-Host ""
    }
} else {
    Write-Host "No processes flagged." -ForegroundColor Green
}

$procScan | ConvertTo-Json -Depth 5 | Out-File "flagged_processes_full.json"
Write-Host "Full detail saved to flagged_processes_full.json" -ForegroundColor Green

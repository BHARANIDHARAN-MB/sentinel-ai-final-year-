# fix_network_and_retry.ps1
# Diagnoses and fixes the "getaddrinfo failed" DNS error seen on mobile
# hotspots, then re-runs setup for any agent that failed.
# Usage:  powershell -ExecutionPolicy Bypass -File fix_network_and_retry.ps1

Write-Host "=== Step 0: Checking for Administrator rights ===" -ForegroundColor Cyan
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if ($isAdmin) {
    Write-Host "  [OK] Running as Administrator" -ForegroundColor Green
} else {
    Write-Host "  [WARN] NOT running as Administrator - the DNS-switch step will fail if needed." -ForegroundColor Yellow
    Write-Host "  If Step 2b below fails, close this window and re-run from an elevated PowerShell" -ForegroundColor Yellow
    Write-Host "  (right-click PowerShell -> Run as Administrator)." -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Step 1: Testing basic internet connectivity ===" -ForegroundColor Cyan
$pingTest = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet
if ($pingTest) {
    Write-Host "  [OK] Internet is reachable (8.8.8.8 responded)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] No internet at all. Check your hotspot is actually connected and has data." -ForegroundColor Red
    Write-Host "  Fix this first, then re-run this script." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Step 2: Testing DNS resolution for pypi.org (A record) ===" -ForegroundColor Cyan
$pypiOk = $false
try {
    Resolve-DnsName -Name pypi.org -ErrorAction Stop | Out-Null
    Write-Host "  [OK] pypi.org resolves fine" -ForegroundColor Green
    $pypiOk = $true
} catch {
    Write-Host "  [FAIL] pypi.org does not resolve" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Step 2b: Testing SRV record resolution (needed for MongoDB Atlas) ===" -ForegroundColor Cyan
# SRV is a DIFFERENT DNS query type than the A records used above. A network
# can resolve normal domains fine while still blocking/dropping SRV queries -
# this happens on some mobile hotspots and campus networks. Testing pypi.org
# alone does NOT prove SRV lookups work, which is why this is a separate check.
$srvOk = $false
try {
    Resolve-DnsName -Name "_mongodb._tcp.cluster0.mongodb.net" -Type SRV -ErrorAction Stop | Out-Null
    Write-Host "  [OK] SRV records resolve fine" -ForegroundColor Green
    $srvOk = $true
} catch {
    Write-Host "  [FAIL] SRV record lookup failed - this breaks mongodb+srv:// connection strings" -ForegroundColor Red
}

if (-not $pypiOk -or -not $srvOk) {
    Write-Host "  DNS issue detected - attempting fix." -ForegroundColor Red

    Write-Host ""
    Write-Host "=== Step 3: Flushing DNS cache ===" -ForegroundColor Cyan
    ipconfig /flushdns | Out-Null
    Write-Host "  DNS cache flushed." -ForegroundColor Green

    Write-Host ""
    Write-Host "=== Step 4: Switching to Google DNS (8.8.8.8) ===" -ForegroundColor Cyan
    Write-Host "  This requires Administrator rights. If this fails, run this whole" -ForegroundColor Yellow
    Write-Host "  script again from an Administrator PowerShell window." -ForegroundColor Yellow
    try {
        $adapter = Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object -First 1
        Set-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -ServerAddresses ("8.8.8.8","1.1.1.1") -ErrorAction Stop
        Write-Host "  [OK] DNS servers set to 8.8.8.8 / 1.1.1.1 on adapter '$($adapter.Name)'" -ForegroundColor Green
        ipconfig /flushdns | Out-Null

        # retest BOTH record types - this is the fix for the bug where the
        # script previously only retested pypi.org (A record) and declared
        # success even when SRV lookups (needed for MongoDB) still failed
        Write-Host ""
        Write-Host "  Retesting..." -ForegroundColor Cyan
        $pypiFixed = $false
        $srvFixed = $false
        try {
            Resolve-DnsName -Name pypi.org -ErrorAction Stop | Out-Null
            Write-Host "  [OK] pypi.org now resolves correctly" -ForegroundColor Green
            $pypiFixed = $true
        } catch {
            Write-Host "  [FAIL] pypi.org still doesn't resolve" -ForegroundColor Red
        }
        try {
            Resolve-DnsName -Name "_mongodb._tcp.cluster0.mongodb.net" -Type SRV -ErrorAction Stop | Out-Null
            Write-Host "  [OK] SRV records now resolve correctly" -ForegroundColor Green
            $srvFixed = $true
        } catch {
            Write-Host "  [FAIL] SRV records still don't resolve" -ForegroundColor Red
        }

        if (-not $pypiFixed -or -not $srvFixed) {
            Write-Host "  Your hotspot/carrier may be blocking DNS at the network level (not just misconfigured)." -ForegroundColor Red
            Write-Host "  Try: toggling mobile data off/on, switching to a different network, or using the" -ForegroundColor Red
            Write-Host "  standard (non-SRV) MongoDB connection string instead - ask for help getting one." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "  [FAIL] Could not change DNS settings - re-run this script AS ADMINISTRATOR (right-click PowerShell -> Run as Administrator)" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "=== Step 5: Re-running setup for any agent that failed ===" -ForegroundColor Cyan

$agents = @("file-scanner-agent", "process-monitor-agent", "response-agent")
foreach ($agent in $agents) {
    Write-Host ""
    Write-Host "--- Retrying $agent ---" -ForegroundColor Yellow
    Push-Location $agent
    .\venv\Scripts\pip.exe install -r requirements.txt
    Pop-Location
}

Write-Host ""
Write-Host "=== Done. Run setup_all.ps1 again, or go straight to start_all.ps1 ===" -ForegroundColor Cyan

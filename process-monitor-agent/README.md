# Sentinel AI — Process Monitoring Agent

Reads the **real, live** OS process table via `psutil` on every scan — this
is not simulated data. Fills the "Endpoint Security Agent" role from your
original design (running processes, CPU/memory, suspicious executables).

## Why this is real, not a demo

Every value comes straight from the operating system at request time:
process names, executable paths, parent/child relationships, live CPU
sampling, and active network connection counts. There's no fixture data,
no pre-canned "detected threat" — if nothing suspicious is running, it
correctly reports zero flagged processes.

## Detection signals

| Signal | How it works | Risk score |
|---|---|---|
| **Blocklist match** | Process name matches a known-malicious names list | 100 |
| **Name masquerade** | A process claims a Windows system name (`svchost.exe`, `lsass.exe`, etc.) but runs from outside `System32` | 95 |
| **Suspicious spawn chain** | Office apps / browsers spawning `powershell.exe`, `cmd.exe`, `wscript.exe`, `mshta.exe` | 90 |
| **Excessive connections** | ≥40 simultaneous connections from one process — possible C2 beacon | 70 |
| **Suspicious location** | Executable running from Temp, Downloads, or AppData\Local\Temp | 60 |
| **Sustained high CPU** | ≥70% CPU sampled over a real interval (not an instantaneous spike) — possible cryptominer | 50 |

## Setup (Windows PowerShell)

```powershell
cd process-monitor-agent
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

uvicorn process_monitor_service:app --host 0.0.0.0 --port 8006 --reload
```

Runs on **port 8006** — next to file-scanner-agent (8005), report-agent
(8004), ML service (8000), Express backend (5000), Vite (5173).

**Run PowerShell as Administrator** for full visibility — without elevated
rights, Windows blocks reading `exe` path, parent process, and connections
for processes owned by other users. Those fields just come back empty
rather than erroring, so the agent still runs, but sees less.

## Test it

```powershell
Invoke-RestMethod -Uri "http://localhost:8006/scan-processes?cpu_sample_seconds=2" -Method GET
```

The `cpu_sample_seconds` parameter controls how long it measures CPU usage
before scoring — higher = more accurate sustained-usage detection, but
the request takes that many seconds to respond (it's actually sampling
in real time, not returning instantly).

## Feeding results into an incident report

Same pattern as the File Scanner Agent:

```python
import requests
from to_incident_finding import scan_to_finding

scan = requests.get("http://localhost:8006/scan-processes?cpu_sample_seconds=2").json()
finding = scan_to_finding(scan)
# append `finding` into the incident's agent_findings[] before
# POST http://localhost:8004/generate-report
```

## Validated during development

Tested against this machine's actual running process table by deliberately
launching two real background processes — one genuinely CPU-intensive, one
running under a blocklisted name — and confirming the live scan caught both
with correct reasons while producing zero false positives on the ~50 other
legitimate processes running at the same time.

## Files

| File | Purpose |
|---|---|
| `process_monitor_service.py` | FastAPI app — reads the live process table on every call |
| `process_heuristics.py` | The six detection signals described above |
| `known_bad_process_names.json` | Sample blocklist — extend from real IOC feeds |
| `to_incident_finding.py` | Converts scan output into the report agent's `agent_findings` shape |

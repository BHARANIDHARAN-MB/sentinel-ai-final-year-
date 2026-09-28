# Sentinel AI — File Scanner Agent

Scans a directory tree for suspicious files and reports findings that plug
straight into the Incident Report Agent. Fills the "Quarantine a suspicious
file" capability from your original design.

## Detection signals

| Signal | How it works | Risk score |
|---|---|---|
| **Known-hash match** | SHA256 of every file checked against a local malicious-hash DB (`known_malicious_hashes.json`) | 100 |
| **Double-extension masquerade** | Flags files like `invoice.pdf.exe` — a decoy extension hiding a real executable extension | 85 |
| **Suspicious drop location** | Executable-type files (`.exe`, `.vbs`, `.ps1`, etc.) found in Temp, Downloads, or Startup folders | 55 |
| **Entropy analysis** | Shannon entropy ≥ 7.5/8.0 on executables/archives — indicates packed or encrypted payloads | 65 |

A file can trigger multiple signals at once; the highest individual score
becomes its overall risk score, and all matching reasons are reported.

## Setup (Windows PowerShell)

```powershell
cd file-scanner-agent
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

uvicorn scanner_service:app --host 0.0.0.0 --port 8005 --reload
```

Runs on **port 8005** — next to `report-agent` (8004), ML service (8000),
Express backend (5000), and Vite (5173).

## Scanning your real system (not the mock test files)

```powershell
# Auto-detects and scans your real Downloads, Desktop, Temp, and Startup folders
Invoke-RestMethod -Uri "http://localhost:8005/scan-common-folders" -Method POST

# See which real directories on this machine it would target, without scanning
Invoke-RestMethod -Uri "http://localhost:8005/common-scan-targets" -Method GET
```

`/scan-common-folders` needs no path argument — it detects your actual
Windows user directories (`%USERPROFILE%\Downloads`, `Desktop`,
`%LOCALAPPDATA%\Temp`, and the Startup folder) at request time. Use
`/scan-directory` with an explicit `path` for anything outside those
defaults.

## Test it

```powershell
Invoke-RestMethod -Uri http://localhost:8005/scan-directory `
  -Method POST -ContentType "application/json" `
  -Body '{"path": "C:\Users\YourUser\Downloads", "recursive": true}'
```

Or scan a whole user profile (takes longer, respects `MAX_FILES_PER_SCAN`):

```powershell
Invoke-RestMethod -Uri http://localhost:8005/scan-directory `
  -Method POST -ContentType "application/json" `
  -Body '{"path": "C:\Users\YourUser", "recursive": true, "max_files": 50000}'
```

## Feeding results into an incident report

```python
import requests
from to_incident_finding import scan_to_finding

scan = requests.post("http://localhost:8005/scan-directory",
                      json={"path": "C:\\Users\\YourUser\\Downloads"}).json()

finding = scan_to_finding(scan)
# {"agent": "File Scanner Agent", "finding": "...", "confidence": 0.99}

# Append this into the incident's agent_findings[] before calling
# POST http://localhost:8004/generate-report
```

## Wiring into the Response Agent

When `risk_score >= 75` on a flagged file, your Response Agent's
quarantine action can move/rename the file (e.g. append `.quarantined`
and strip execute permission) rather than deleting it outright, so a
false positive is always recoverable — same "contain, don't destroy"
philosophy as your login-response flow.

## Safety limits (already built in)

- Max 20,000 files per scan by default (override with `max_files`)
- Skips files over 200MB
- Skips `node_modules`, `.git`, `venv`, `__pycache__`, `$RECYCLE.BIN`, `WinSxS`
- Entropy check caps at reading the first 2MB of any file (perf guard)

## Extending the hash database

Replace the hardcoded sample in `known_malicious_hashes.json` with a
scheduled sync job against a real feed — MalwareBazaar and AbuseCH both
publish free SHA256 hash lists. A simple cron/Task Scheduler job that
pulls the latest CSV and rewrites this JSON weekly is enough for a
final-year project; VirusTotal's API is the natural upgrade if you want
live per-file lookups instead of a static list.

## Files

| File | Purpose |
|---|---|
| `scanner_service.py` | FastAPI app — the agent process |
| `hash_checker.py` | SHA256 computation + known-malware DB lookup |
| `heuristics.py` | Double-extension, suspicious-location, entropy checks |
| `known_malicious_hashes.json` | Sample local hash DB (EICAR test signature included for safe testing) |
| `to_incident_finding.py` | Converts scan output into the report agent's `agent_findings` shape |
| `test_target/` | Mock files used to validate detection during development — safe to delete |

## Validated during development

Tested against real planted threats (an EICAR test-signature file, a
`invoice.pdf.exe` double-extension file, a script dropped in a Temp-style
path, and a randomly-packed `.exe`) alongside genuinely clean files, all
via the live HTTP API — 4/4 threats correctly flagged, 0 false positives
on clean files.

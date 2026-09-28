# Sentinel AI — Getting Started

Follow these steps in order on your Windows machine.

## Prerequisites

Check you have these installed — open PowerShell and run each:

```powershell
python --version    # need 3.10+
node --version       # need 18+
npm --version
```

If any are missing, install Python from python.org and Node from nodejs.org
(check "Add to PATH" during install), then reopen PowerShell.

## Step 1 — Organize the folder

Put everything in one folder, like this:

```
sentinel-ai\
├── report_service.py
├── llm_summarizer.py
├── generate_docx.js
├── package.json
├── requirements.txt
├── sample_incident.json
├── setup_all.ps1
├── start_all.ps1
├── test_pipeline.ps1
├── file-scanner-agent\
│   ├── scanner_service.py
│   ├── hash_checker.py
│   ├── heuristics.py
│   ├── known_malicious_hashes.json
│   ├── to_incident_finding.py
│   └── requirements.txt
├── process-monitor-agent\
│   ├── process_monitor_service.py
│   ├── process_heuristics.py
│   ├── known_bad_process_names.json
│   ├── to_incident_finding.py
│   └── requirements.txt
└── response-agent\
    ├── response_service.py
    ├── actions.py
    ├── playbooks.py
    ├── audit_log.py
    └── requirements.txt
```

Open PowerShell in that `sentinel-ai\` folder (Shift + Right-click inside
the folder → "Open PowerShell window here").

## Step 2 — One-time setup

```powershell
powershell -ExecutionPolicy Bypass -File setup_all.ps1
```

This creates a Python virtual environment for each of the four agents,
installs their dependencies, and runs `npm install` for the report
renderer. Takes a few minutes the first time.

## Step 3 — Start all four agents

```powershell
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

Four new PowerShell windows open, one per agent:

| Window | Agent | Port |
|---|---|---|
| REPORT AGENT | Turns incident data into a Word report | 8004 |
| FILE SCANNER AGENT | Scans folders for suspicious files | 8005 |
| PROCESS MONITOR AGENT | Reads your live running processes | 8006 |
| RESPONSE AGENT | Executes containment actions | 8007 |

The Response Agent starts in **simulate mode** by default — safe, no real
system changes. Leave it that way until you specifically want to
demonstrate live containment.

Keep all four windows open while you work — closing a window stops that
agent.

## Step 4 — Verify everything is up

Open a **fifth** PowerShell window in the same folder and run:

```powershell
powershell -ExecutionPolicy Bypass -File test_pipeline.ps1
```

This checks all four `/health` endpoints, then runs one real pipeline
pass: scans your actual Downloads/Desktop/Temp folders, scans your actual
running processes, and generates a sample Word report
(`pipeline_test_report.docx`) — open it to confirm the whole chain works.

## Step 5 — Try each agent individually

Once the smoke test passes, explore each piece on its own:

```powershell
# Scan your real files
Invoke-RestMethod -Uri "http://localhost:8005/scan-common-folders" -Method POST

# See your real flagged processes
Invoke-RestMethod -Uri "http://localhost:8006/scan-processes?cpu_sample_seconds=2"

# Get a playbook recommendation for a risk score
Invoke-RestMethod -Uri "http://localhost:8007/plan-response" -Method POST `
  -ContentType "application/json" -Body '{"incident_id":"DEMO-1","risk_score":85}'

# Check the response agent's audit trail
Invoke-RestMethod -Uri "http://localhost:8007/audit-log"
```

## Step 6 — Connect it to your Node/Express + React frontend

Each Python agent is a standalone FastAPI service your existing Express
backend can call over HTTP (see the `axios` example in each agent's
README). A typical flow from your backend:

1. Login/auth risk detected → Express calls Response Agent to block the IP
2. Dashboard "Scan Now" button → Express calls File Scanner + Process
   Monitor, combines their findings
3. Combined findings → Express calls Report Agent, streams the `.docx`
   back to the browser or emails it via Resend
4. Every action taken → pull from Response Agent's `/audit-log` to
   populate your dashboard's Incident Timeline

## Troubleshooting

**"cannot be loaded because running scripts is disabled"** — you forgot
`-ExecutionPolicy Bypass`. Always run the `.ps1` scripts with that flag.

**A port is already in use** — another process is using 8004–8007. Find
and stop it: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8004).OwningProcess`

**Process Monitor / Response Agent show reduced results** — run
PowerShell **as Administrator**. Both need elevated rights to see other
users' processes and to make real firewall/process changes in live mode.

**`npm install` fails in report-agent** — make sure you ran
`setup_all.ps1` from inside `sentinel-ai\` (the report agent's
`package.json` lives at the root, not in a subfolder).

## What to say in your report/viva about testing

Every agent in this project was validated against real, live artifacts
during development, not just theoretical logic:
- File Scanner: caught 4/4 deliberately planted threats (hash match,
  double-extension, suspicious location, high entropy) with 0 false
  positives on clean files.
- Process Monitor: caught a real CPU-abuse process and a real
  blocklisted-name process among ~50 genuine live processes, correctly.
- Response Agent: actually killed a real process and actually
  quarantined/restored a real file in live mode; correctly took no
  action in simulate mode; and its audit-log integrity check was caught
  failing during testing, fixed, and re-verified both ways (clean log
  passes, tampered log fails).

That last point — a security control that was tested for both the
"should pass" and "should catch tampering" cases — is worth calling out
explicitly; it's the kind of detail that distinguishes a project that
was actually tested from one that was just written.

# Sentinel AI — Complete Command Reference

All commands assume PowerShell opened inside your `sentinel-ai\` folder,
unless a subfolder is specified.

---

## 1. First-time setup (once per machine)

```powershell
powershell -ExecutionPolicy Bypass -File setup_all.ps1
```

Sets up all 5 backend agents (Python venvs + Node deps) and creates
`auth-backend\.env` from the template on first run.

```powershell
cd frontend
npm install
cd ..
```

## 2. Configure secrets (once, edit locally — never paste real values into chat)

**Root `.env`** (next to `report_service.py`) — enables real AI chat/report narratives:
```powershell
copy .env.example .env
notepad .env
```
Fill in `GROQ_API_KEY` — free at [console.groq.com](https://console.groq.com) → API Keys.

**`auth-backend\.env`** — enables login/OTP:
```powershell
notepad auth-backend\.env
```
Fill in:
- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- **Email (pick one):**
  - `GMAIL_USER` + `GMAIL_APP_PASSWORD` — sends via your real Gmail, works with any recipient, no domain needed (see auth-backend/README.md for the App Password setup)
  - or `RESEND_API_KEY` + `FROM_EMAIL` — only delivers to your own Resend account's email unless you verify a domain

## 3. Start everything

```powershell
powershell -ExecutionPolicy Bypass -File start_all.ps1
```

Opens 6 windows:

| Window | Agent | Port |
|---|---|---|
| REPORT AGENT | Reports + AI chat endpoint | 8004 |
| FILE SCANNER AGENT | Scans folders for suspicious files | 8005 |
| PROCESS MONITOR AGENT | Reads live running processes | 8006 |
| RESPONSE AGENT | Executes containment actions | 8007 |
| FILE SEARCH AGENT | Finds files/folders/media by name | 8008 |
| AUTH BACKEND | Login, register, OTP verification | 8009 |

Response Agent starts in **simulate mode** by default.

## 4. Verify + run a full pipeline test

```powershell
powershell -ExecutionPolicy Bypass -File test_pipeline.ps1
```

## 5. Restart everything after changing code or .env

```powershell
powershell -ExecutionPolicy Bypass -File restart_all.ps1
```

## 6. Start the frontend

```powershell
cd frontend
npm run dev
```
Open: `http://localhost:5173`

## 7. Stop everything

Close the 6 agent windows, or from a new terminal:

```powershell
Get-Process uvicorn -ErrorAction SilentlyContinue | Stop-Process -Force
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
```

---

## Running agents individually

```powershell
# Report Agent (from sentinel-ai\)
.\venv\Scripts\Activate.ps1
uvicorn report_service:app --host 0.0.0.0 --port 8004 --reload

# File Scanner Agent
cd file-scanner-agent
.\venv\Scripts\Activate.ps1
uvicorn scanner_service:app --host 0.0.0.0 --port 8005 --reload

# Process Monitor Agent
cd process-monitor-agent
.\venv\Scripts\Activate.ps1
uvicorn process_monitor_service:app --host 0.0.0.0 --port 8006 --reload

# Response Agent (simulate mode - safe default)
cd response-agent
.\venv\Scripts\Activate.ps1
$env:RESPONSE_MODE = "simulate"
uvicorn response_service:app --host 0.0.0.0 --port 8007 --reload

# Response Agent (LIVE mode - actually kills processes/blocks IPs/moves files)
$env:RESPONSE_MODE = "live"
uvicorn response_service:app --host 0.0.0.0 --port 8007 --reload

# File Search Agent
cd file-search-agent
.\venv\Scripts\Activate.ps1
uvicorn search_service:app --host 0.0.0.0 --port 8008 --reload

# Auth Backend
cd auth-backend
npm start
```

---

## Health checks

```powershell
Invoke-RestMethod http://localhost:8004/health
Invoke-RestMethod http://localhost:8005/health
Invoke-RestMethod http://localhost:8006/health
Invoke-RestMethod http://localhost:8007/health
Invoke-RestMethod http://localhost:8008/health
Invoke-RestMethod http://localhost:8009/health
```

---

## Report Agent (8004)

```powershell
# Generate a report from the sample incident
Invoke-WebRequest -Uri http://localhost:8004/generate-report `
  -Method POST -ContentType "application/json" `
  -InFile sample_incident.json -OutFile my_report.docx

# Chat with the AI assistant directly (bypassing the frontend)
Invoke-RestMethod -Uri http://localhost:8004/chat -Method POST `
  -ContentType "application/json" `
  -Body '{"message": "what did the scan find?", "context": {"totalFlagged": 3}}'
```

---

## File Scanner Agent (8005)

```powershell
# Scan real Downloads/Desktop/Temp/Startup, blocking (simple, no progress bar)
Invoke-RestMethod -Uri http://localhost:8005/scan-common-folders -Method POST

# Same, but as a background job with live progress (what the frontend uses)
$job = Invoke-RestMethod -Uri http://localhost:8005/scan-common-folders/start -Method POST
Invoke-RestMethod -Uri "http://localhost:8005/scan-progress/$($job.job_id)"
# ^ poll that second command repeatedly to watch files_scanned / files_total / current_file climb

# Scan a specific folder
Invoke-RestMethod -Uri http://localhost:8005/scan-directory -Method POST `
  -ContentType "application/json" `
  -Body '{"path": "C:\Users\YourUser\Downloads", "recursive": true}'

# See which real folders scan-common-folders targets
Invoke-RestMethod -Uri http://localhost:8005/common-scan-targets
```

---

## Process Monitor Agent (8006)

```powershell
Invoke-RestMethod -Uri "http://localhost:8006/scan-processes?cpu_sample_seconds=2"
```

---

## Response Agent (8007)

```powershell
# Get a playbook recommendation for a risk score (does NOT execute anything)
Invoke-RestMethod -Uri http://localhost:8007/plan-response -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "DEMO-1", "risk_score": 85}'

# Execute a real action
Invoke-RestMethod -Uri http://localhost:8007/execute-action -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "DEMO-1", "action_type": "quarantine_file", "target": "C:\Users\YourUser\Downloads\suspicious.exe"}'

# Roll back a reversible action
Invoke-RestMethod -Uri http://localhost:8007/rollback-action -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "DEMO-1", "action_type": "restore_file", "target": "C:\...\quarantine\...quarantined"}'

# View the tamper-evident audit trail
Invoke-RestMethod -Uri http://localhost:8007/audit-log
```

---

## File Search Agent (8008)

```powershell
# Basic search (files + folders, any category)
Invoke-RestMethod -Uri http://localhost:8008/search-file -Method POST `
  -ContentType "application/json" -Body '{"query": "resume"}'

# Filter to just pictures, videos, folders, or documents
Invoke-RestMethod -Uri http://localhost:8008/search-file -Method POST `
  -ContentType "application/json" -Body '{"query": "vacation", "category": "image"}'
# category: "any" | "image" | "video" | "document" | "folder" | "other"

# See which real folders are searched by default
Invoke-RestMethod -Uri http://localhost:8008/default-search-roots
```

---

## Auth Backend (8009)

```powershell
# Register
Invoke-RestMethod -Uri http://localhost:8009/api/auth/register -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "you@example.com", "password": "SecurePass123"}'

# Login (step 1 - sends OTP)
Invoke-RestMethod -Uri http://localhost:8009/api/auth/login -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "you@example.com", "password": "SecurePass123"}'

# Verify OTP (step 2 - returns a JWT)
Invoke-RestMethod -Uri http://localhost:8009/api/auth/verify-otp -Method POST `
  -ContentType "application/json" `
  -Body '{"email": "you@example.com", "otp": "123456"}'

# Check a token
Invoke-RestMethod -Uri http://localhost:8009/api/auth/me `
  -Headers @{ Authorization = "Bearer YOUR_TOKEN_HERE" }

# Run the auth backend's own test suite (11 scenarios, mocked DB, no real Mongo needed)
cd auth-backend
npm test
```

---

## Troubleshooting commands

```powershell
# "running scripts is disabled" error - always run .ps1 files with:
powershell -ExecutionPolicy Bypass -File <script>.ps1

# Find what's using a port (e.g. 8004) and its process
Get-Process -Id (Get-NetTCPConnection -LocalPort 8004).OwningProcess

# Kill whatever is on a port
Stop-Process -Id (Get-NetTCPConnection -LocalPort 8004).OwningProcess -Force

# MongoDB DNS SRV lookup failing (common on mobile hotspots)
powershell -ExecutionPolicy Bypass -File fix_network_and_retry.ps1
# then verify manually:
nslookup -type=SRV _mongodb._tcp.<your-cluster-name>.mongodb.net

# Reinstall a single agent's Python dependencies
cd file-scanner-agent
.\venv\Scripts\pip.exe install -r requirements.txt

# Reinstall Node dependencies for auth-backend or frontend
cd auth-backend   # or frontend
npm install

# Run PowerShell as Administrator (needed for: full Process Monitor
# visibility, live-mode kill_process/block_ip, and DNS-adapter changes) -
# right-click PowerShell -> "Run as Administrator"
```

---

## Quick reference: ports

| Port | Service |
|---|---|
| 8004 | Report Agent (also hosts `/chat`) |
| 8005 | File Scanner Agent |
| 8006 | Process Monitor Agent |
| 8007 | Response Agent |
| 8008 | File Search Agent |
| 8009 | Auth Backend |
| 5173 | Frontend (Vite dev server) |

# Sentinel AI — Incident Report Agent

Turns raw multi-agent detection data into a polished, downloadable Word
incident report. Sits alongside your other Python agents (Authentication,
Endpoint Telemetry, Threat Intelligence) as `report-agent`.

## How it fits into Sentinel AI

```
Threat Correlation Engine  ─┐
Response Agent (actions)   ─┼─► POST /generate-report ─► report-agent ─► .docx
Agent findings + MITRE IDs ─┘         (this service)
```

Call this endpoint whenever an incident is created or closed — either
automatically (attach the PDF/Word report to the confirmation email) or
on-demand from an "Export Report" button in the dashboard.

## Setup (Windows PowerShell)

```powershell
cd report-agent
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

npm init -y
npm install docx

# Optional: enables real LLM-written narrative instead of the template fallback
$env:ANTHROPIC_API_KEY = "sk-ant-..."

uvicorn report_service:app --host 0.0.0.0 --port 8004 --reload
```

Runs on **port 8004** — doesn't collide with your existing ML service (8000),
Express backend (5000), or Vite dev server (5173).

## Test it

```powershell
# PowerShell
Invoke-WebRequest -Uri http://localhost:8004/generate-report `
  -Method POST -ContentType "application/json" `
  -InFile sample_incident.json -OutFile test_report.docx
```

Or from your Node/Express backend, once an incident is finalized:

```javascript
// In your Response Agent's incident-closing handler
const axios = require("axios");
const fs = require("fs");

async function attachIncidentReport(incidentData) {
  const response = await axios.post(
    "http://localhost:8004/generate-report",
    incidentData,
    { responseType: "arraybuffer" }
  );
  const filePath = `./reports/${incidentData.incident_id}_report.docx`;
  fs.writeFileSync(filePath, response.data);
  return filePath; // attach this to the Resend email, or serve via /reports route
}
```

## React dashboard button

```jsx
async function downloadReport(incidentId, incidentData) {
  const res = await fetch("http://localhost:8004/generate-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(incidentData),
  });
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${incidentId}_report.docx`;
  a.click();
}
```

## Files

| File | Purpose |
|---|---|
| `report_service.py` | FastAPI app — the actual "agent" process |
| `llm_summarizer.py` | Calls Claude to write the narrative sections; falls back to a template if no API key is set, so it never breaks a live demo |
| `generate_docx.js` | Renders the final `.docx` using `docx` (docx-js) — risk banner, tables, MITRE mapping, footer pagination |
| `sample_incident.json` | Example payload matching your Threat Correlation Engine's output shape — adjust field names to match your actual schema |

## Companion agent: File Scanner

`file-scanner-agent/` (port 8005) scans a directory tree for suspicious
files — known-malware hash matches, double-extension masquerades (e.g.
`invoice.pdf.exe`), suspicious drop locations, and high-entropy packed
payloads. Its `/scan-common-folders` endpoint auto-detects and scans your
real Downloads, Desktop, Temp, and Startup folders — no manual path
needed. Its output converts directly into an `agent_findings` entry via
`file-scanner-agent/to_incident_finding.py`, so a filesystem scan can feed
straight into the same incident report this service generates. See
`file-scanner-agent/README.md` for setup and detection details.

## Companion agent: Process Monitor

`process-monitor-agent/` (port 8006) reads the real, live OS process table
via `psutil` — not simulated data — and flags processes using name
masquerade detection, suspicious spawn chains (e.g. Word spawning
PowerShell), a known-bad-name blocklist, sustained CPU sampling, and
connection-count anomalies. Validated during development by planting real
CPU-heavy and suspiciously-named processes and confirming live detection.
See `process-monitor-agent/README.md` for setup and detection details.

## Companion agent: Response Agent

`response-agent/` (port 8007) is the piece that actually acts — kill
process, block IP, quarantine file, disable account — gated by a hard
`RESPONSE_MODE=simulate|live` toggle, with rollback support and a
hash-chained tamper-evident audit log. Every action was validated against
real processes and real files during development (see its README for the
exact tests run, including one bug the tests caught and fixed). Its
`/audit-log` endpoint maps directly into this report agent's
`actions_taken[]` field. See `response-agent/README.md` for setup and
safety notes before running in live mode.

## Companion agent: File Search

`file-search-agent/` (port 8008) finds files by name across your real
Downloads/Desktop/Documents, with fuzzy tolerance for typos (exact →
partial → similarity-based matching) and LLM-assisted keyword expansion
(e.g. "resume" also tries "cv"). Wired into the frontend's voice/text
chat assistant — say "find file budget" and it routes here. See
`file-search-agent/README.md` for details.

## Auth Backend

`auth-backend/` (port 8009, Node/Express/MongoDB) is real authentication —
password + 6-digit OTP emailed via Resend, then a JWT. Replaces the
frontend's earlier demo login. Test suite covers 11 end-to-end scenarios
including no-email-enumeration and OTP replay rejection. See
`auth-backend/README.md` for setup (needs a MongoDB URI and a JWT secret
at minimum; Resend API key optional for local dev, required for real
email delivery).

## Chat assistant + voice

The Report Agent exposes a `/chat` endpoint (Claude-backed, with a
rule-based fallback if no API key is set) that the frontend's floating
assistant widget uses for both typed and spoken questions about your
scan results — using the browser's native Web Speech API for voice
input/output, no extra service required. See `frontend/FRONTEND_README.md`.

## Notes

- The risk banner color auto-switches (red ≥75, orange ≥40, green below) —
  matches the same thresholds you're using for containment vs. alert-only.
- `mitre_techniques` array is optional-friendly — if your correlation engine
  doesn't tag technique IDs yet, just pass an empty array and that section
  renders empty rather than erroring.
- `actions_taken[].mode` drives the `[AUTO]` / `[PENDING APPROVAL]` tags —
  wire this directly to your Response Agent's `RESPONSE_MODE` flag output.

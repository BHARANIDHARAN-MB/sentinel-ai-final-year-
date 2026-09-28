# Sentinel AI — Response Agent

Executes containment actions with a hard `RESPONSE_MODE` toggle. This is
the piece that actually *does* something to a real system, so read the
safety section before switching to live mode.

## Simulate vs Live — how it's enforced

Every action function in `actions.py` checks `RESPONSE_MODE` first. In
`simulate` (the default), it returns immediately with a description of
what it *would* do and touches nothing. In `live`, it performs the real
operation. This isn't cosmetic — the mode check is the first line of
every function, before any system call.

```powershell
$env:RESPONSE_MODE = "simulate"   # safe default - logs intent only
$env:RESPONSE_MODE = "live"       # actually kills processes / blocks IPs / moves files
uvicorn response_service:app --host 0.0.0.0 --port 8007 --reload
```

Runs on **port 8007** — next to process-monitor-agent (8006),
file-scanner-agent (8005), report-agent (8004).

## Actions

| Action | Simulate mode | Live mode | Reversible? |
|---|---|---|---|
| `kill_process` | Logs intent only | `psutil` terminate → escalates to kill after 3s timeout | No — process is gone |
| `block_ip` | Logs intent only | `netsh advfirewall` (Windows) / `iptables` (Linux) | Yes — `unblock_ip` |
| `quarantine_file` | Logs intent only | Moves file to `quarantine/`, strips write/execute permission | Yes — `restore_file` |
| `disable_account` | Logs intent only | Calls a backend callback you wire to your Express API | Depends on your backend |

## Validated during development

Every action was tested against **real artifacts**, not mocks:

- **kill_process**: spawned a real background Python process, confirmed it
  was alive via `poll()`, called `kill_process` in live mode, confirmed
  `poll()` now returns a real exit code (process actually gone). Also
  confirmed simulate mode leaves a real running process completely
  untouched.
- **quarantine_file / restore_file**: created a real file, quarantined it
  (confirmed original path genuinely no longer exists, file appears in
  `quarantine/` as read-only), then restored it (confirmed original
  content intact at the original path).
- **block_ip**: called against a real IP in live mode. In this development
  sandbox (no `iptables`/`netsh` installed), it correctly returned an
  **honest failure** — "Firewall tool not found" — rather than faking
  success. On your Windows machine with `netsh` available and PowerShell
  running as Administrator, the same code performs a real firewall rule.
- **Audit log integrity**: logged four real actions, verified the
  hash-chain reports `chain_intact: true`, then deliberately tampered
  with one entry's `result` field and confirmed the check correctly flips
  to `false`. This was caught and fixed during testing — the first version
  had a hashing-order bug that made the check always fail; don't trust an
  audit feature you haven't broken on purpose to see if it notices.

## API

```powershell
# Get the playbook-suggested response tier for a risk score (doesn't execute anything)
Invoke-RestMethod -Uri http://localhost:8007/plan-response -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "INC-001", "risk_score": 95}'

# Execute a real action
Invoke-RestMethod -Uri http://localhost:8007/execute-action -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "INC-001", "action_type": "quarantine_file", "target": "C:\Users\You\Downloads\suspicious.exe"}'

# Roll back a reversible action
Invoke-RestMethod -Uri http://localhost:8007/rollback-action -Method POST `
  -ContentType "application/json" `
  -Body '{"incident_id": "INC-001", "action_type": "restore_file", "target": "C:\...\quarantine\20260811_...suspicious.exe.quarantined"}'

# View the tamper-evident audit trail
Invoke-RestMethod -Uri http://localhost:8007/audit-log
```

## Playbooks

`playbooks.py` maps risk score to a suggested action tier (CRITICAL / HIGH
/ MEDIUM / LOW). `/plan-response` returns the suggestion only — it does
**not** auto-execute. You (or your dashboard's "Confirm" button) decide
whether to actually call `/execute-action` for each suggested action. This
matches your original design: automatic containment for the reversible,
low-collateral actions (block IP, quarantine file), user confirmation
before anything destructive (kill process, disable account).

## Wiring into the rest of Sentinel AI

- **From Process Monitoring Agent**: when a process is flagged with
  `risk_score >= 75`, call `/execute-action` with `action_type:
  "kill_process"`, `target: <pid>`.
- **From File Scanner Agent**: when a file is flagged, call
  `/execute-action` with `action_type: "quarantine_file"`.
- **From Authentication Agent** (your login-risk flow): when a login is
  flagged, call `/execute-action` with `action_type: "block_ip"` for the
  suspicious source IP.
- **Into Incident Report Agent**: pull `/audit-log?incident_id=...` and
  map each entry into the `actions_taken[]` array in your report payload
  — the `mode` field already matches the `[AUTO]` / `[PENDING APPROVAL]`
  tags the report renderer expects.

## Important for your viva/demo

Run PowerShell **as Administrator** for live-mode `block_ip` and
`kill_process` on other users' processes — Windows blocks both otherwise,
and you'll see honest `AccessDenied` failures logged rather than silent
no-ops. Keep `RESPONSE_MODE=simulate` for any live audience demo unless
you specifically want to show real containment — killing a real process
or blocking a real IP on your own machine has real consequences.

## Files

| File | Purpose |
|---|---|
| `response_service.py` | FastAPI app — the agent process |
| `actions.py` | The four containment actions + two rollbacks, each simulate/live-gated |
| `playbooks.py` | Risk score → suggested action tier mapping |
| `audit_log.py` | Hash-chained, tamper-evident JSONL audit trail |
| `quarantine/` | Where live-mode `quarantine_file` moves real files |

# Sentinel AI — Frontend

React + Vite + Tailwind dashboard for the 4 agents. Runs on your machine
and talks directly to your local agents (ports 8004-8007) - no separate
backend needed for this dashboard itself.

## The flow

1. **Landing page** - theme/marketing page with a radar-sweep visual
   showing your 4 agents
2. **Sign in** (modal popup) - demo auth, any credentials work; see note below
3. **Dashboard** - choose File Scan, Process Scan, or both; shows live
   agent online/offline status
4. **Scan progress** (popup) - live status as it calls your real agents
5. **Results** (popup) - flagged + signature-cleared counts, click any
   item for detail
6. **Detail panel** - plain-English explanation of every technical reason,
   generated client-side (no LLM call needed, instant)
7. **Generate incident report** - builds a real incident payload from the
   scan results, POSTs to your Report Agent, downloads a `.docx`
8. **Voice/text assistant** - floating mic button, bottom-right, on every
   screen after login. Say or type "find file [name]" to search your real
   filesystem via the File Search Agent, or ask about your last scan
   ("what did it find?", "is my system safe?") to get an answer from the
   Report Agent's `/chat` endpoint, spoken back via text-to-speech.

## Setup (Windows PowerShell)

```powershell
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173`. Your File Scanner (8005), Process
Monitor (8006), and Report Agent (8004) need to already be running -
start them with `start_all.ps1` from the project root first.

## About the login

This is a **demo login** - any email/password combination works, there's
no real user database yet. This is intentional: building a fake-secure
auth system would be worse than being upfront that it's a placeholder.

To make it real, wire `LoginModal.jsx`'s `onLogin` handler to your
Express `/api/auth/login` endpoint (the same JWT pattern your
CyberDefensePlatform project already uses) instead of accepting any input.

## Files

| File | Purpose |
|---|---|
| `src/App.jsx` | Top-level flow state (landing → login → dashboard → scan → results) |
| `src/api.js` | Fetch wrappers for all 4 agents |
| `src/explain.js` | Turns technical flag reasons into plain-English explanations, client-side |
| `src/buildIncident.js` | Converts scan results into a Report Agent-compatible incident, including MITRE ATT&CK mapping |
| `src/components/LandingPage.jsx` | Theme page with the radar-sweep signature visual |
| `src/components/LoginModal.jsx` | Sign-in popup |
| `src/components/Dashboard.jsx` | Scan option selection, live agent status |
| `src/components/ScanProgressModal.jsx` | Live scan progress popup |
| `src/components/ResultsModal.jsx` | Flagged/cleared results popup |
| `src/components/FileDetailPanel.jsx` | Detailed explanation slide-over |
| `src/components/ReportModal.jsx` | Report generation + download |
| `src/components/VoiceChatBot.jsx` | Floating voice/text assistant — Web Speech API for input/output, routes "find file X" to the File Search Agent (8008) and everything else to the Report Agent's `/chat` (8004) |

## Voice assistant notes

- Requires Chrome or Edge (Web Speech API isn't fully supported in
  Firefox/Safari) — the widget detects this and falls back to text-only
  automatically, with a visible note explaining why.
- "find file [name]" / "search for [name]" / "locate [name]" are
  recognized as file-search intents client-side via a simple regex; the
  File Search Agent must be running on port 8008 for this to work.
- Everything else goes to `/chat` on the Report Agent, which uses Claude
  if `ANTHROPIC_API_KEY` is set, or a small set of rule-based responses
  about your last scan summary otherwise.

## Design tokens

Background `#0B0F19`, panels `#131A2A`, signal amber `#E8A33D` (primary
accent), threat red `#E5484D`, verified green `#3DDC97`. Display type is
Space Grotesk, body is Inter, data (hashes/PIDs/timestamps) is JetBrains
Mono. Deliberately steered away from the generic "black background, neon
hacker-green" cybersecurity-demo look — see `tailwind.config.js` for the
full token set.

## Validated during development

Screenshotted every screen against real running code, not just checked
that it compiled. The scan flow was run against actually-live File
Scanner and Process Monitor agents mid-development and genuinely caught
an unstaged real process during testing (Playwright's own browser
process) — proof the UI talks to real agents, not fixtures.

Testing this way also caught two real bugs before you'd have hit them:
- The detail panel showed "Verified safe" in red instead of green for
  signature-cleared items (color logic read the pre-clearance risk score
  instead of checking clearance status) - fixed.
- The report's fallback narrative (used when no `ANTHROPIC_API_KEY` is
  set) hardcoded login-attempt language even for scan-type incidents with
  no login involved, producing sentences like "following a login attempt"
  when there was none. Fixed to build the narrative from whatever data is
  actually present, and the Word template now hides the Source
  IP/Geo-Location/Device rows entirely when there's no login data instead
  of showing three misleading "N/A" rows.

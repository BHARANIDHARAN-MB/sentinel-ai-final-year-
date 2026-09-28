# Sentinel AI — File Search Agent

Finds files on your real filesystem by name, with fuzzy tolerance for
typos and partial names.

## How matching works

Three tiers, in order of confidence:

1. **Exact** — filename matches the query exactly (case-insensitive)
2. **Partial** — the query is a substring of the filename
3. **Similar** — the filename is textually close to the query via
   `difflib.SequenceMatcher` (catches typos like "envoice" → "invoice")

Results are ranked exact → partial → similar, then by similarity score
within each tier.

## Query expansion

Before searching, your query is expanded with related keywords — e.g.
searching "resume" also tries "cv" and "curriculum vitae". With an
`ANTHROPIC_API_KEY` set, Claude generates these expansions per search
(one call per search, not per file — the per-file matching itself stays
local and instant). Without a key, a small built-in synonym dictionary
covers common cases (resume/cv, invoice/receipt, photo/image, etc.).

## Setup (Windows PowerShell)

```powershell
cd file-search-agent
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt

uvicorn search_service:app --host 0.0.0.0 --port 8008 --reload
```

Runs on **port 8008**, alongside the other four agents.

## Test it

```powershell
Invoke-RestMethod -Uri http://localhost:8008/search-file -Method POST `
  -ContentType "application/json" -Body '{"query": "resume"}'

# Search a specific folder instead of the defaults
Invoke-RestMethod -Uri http://localhost:8008/search-file -Method POST `
  -ContentType "application/json" `
  -Body '{"query": "budget", "search_roots": ["C:\Users\YourUser\Documents"]}'
```

## Validated during development

Tested against real planted files: an exact/partial match ("resume" →
`Bharani_Resume_2026.pdf`), a genuine typo ("envoice" → correctly
fuzzy-matched `invoice_march.pdf` at 0.60 similarity), and synonym
expansion (searching "resume" also surfaced `CV_final_v3.docx` via the
fallback dictionary) — while correctly NOT matching unrelated files
(`random_notes.txt`, `vacation_photo.jpg`) in the same folder.

## Files

| File | Purpose |
|---|---|
| `search_service.py` | FastAPI app — the agent process |
| `fuzzy_search.py` | Exact/partial/similarity matching against the real filesystem |
| `query_expander.py` | LLM-assisted (or dictionary-fallback) keyword expansion |

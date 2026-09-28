"""
report_service.py
------------------
Sentinel AI - Incident Report Agent

Run:
    uvicorn report_service:app --host 0.0.0.0 --port 8004 --reload

Endpoint:
    POST /generate-report
    Body: incident JSON (see sample_incident.json)
    Returns: incident_report.docx (binary download)
"""

import json
import subprocess
import tempfile
import os
import uuid

from dotenv import load_dotenv
load_dotenv()  # loads ANTHROPIC_API_KEY (and anything else) from .env, matching
                # the other services instead of requiring a manual $env: command

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from llm_summarizer import generate_narrative
from chat_assistant import get_chat_reply

app = FastAPI(title="Sentinel AI - Incident Report Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "generated_reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.get("/health")
def health():
    return {"status": "ok", "agent": "report-agent"}


class ChatRequest(BaseModel):
    message: str
    context: Optional[dict] = None


@app.post("/chat")
def chat(req: ChatRequest):
    """
    Backend for the voice/text chat assistant. `context` can carry the
    frontend's last scan summary (e.g. {"totalFlagged": 3, "totalScanned": 2671})
    so the assistant can answer questions about actual results.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message cannot be empty")
    reply = get_chat_reply(req.message, req.context)
    return {"reply": reply}


@app.post("/generate-report")
def generate_report(incident: dict):
    """
    Accepts an incident JSON payload (as produced by the Threat Correlation
    Engine / Response Agent), generates an LLM narrative, renders a Word
    document, and returns it as a file download.
    """
    if "incident_id" not in incident:
        raise HTTPException(status_code=400, detail="incident_id is required")

    # 1. Generate narrative sections via LLM (falls back to template if no API key)
    narrative = generate_narrative(incident)
    combined = {**incident, "narrative": narrative}

    # 2. Write combined data to a temp file for the docx renderer to consume
    job_id = uuid.uuid4().hex[:8]
    input_path = os.path.join(tempfile.gettempdir(), f"incident_{job_id}.json")
    output_filename = f"{incident['incident_id']}_report.docx"
    output_path = os.path.join(OUTPUT_DIR, output_filename)

    with open(input_path, "w") as f:
        json.dump(combined, f)

    # 3. Call the docx-js renderer
    result = subprocess.run(
        ["node", os.path.join(BASE_DIR, "generate_docx.js"), input_path, output_path],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise HTTPException(status_code=500, detail=f"Report rendering failed: {result.stderr}")

    return FileResponse(
        path=output_path,
        filename=output_filename,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)

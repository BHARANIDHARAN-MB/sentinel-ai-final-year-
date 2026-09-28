"""
response_service.py
----------------------
Sentinel AI - Response Agent

Executes containment actions (kill process, block IP, quarantine file,
disable account) with a hard simulate/live toggle via RESPONSE_MODE env
var, full audit logging, and rollback support for reversible actions.

Run:
    $env:RESPONSE_MODE = "simulate"    # or "live" - PowerShell
    uvicorn response_service:app --host 0.0.0.0 --port 8007 --reload
"""

import os
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import actions
from playbooks import get_playbook
from audit_log import log_action, read_audit_log, verify_chain_integrity

app = FastAPI(title="Sentinel AI - Response Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ActionRequest(BaseModel):
    incident_id: str
    action_type: str   # "kill_process" | "block_ip" | "quarantine_file" | "disable_account"
    target: str         # PID (as string), IP address, filepath, or account_id


class RollbackRequest(BaseModel):
    incident_id: str
    action_type: str   # "unblock_ip" | "restore_file"
    target: str          # IP address, or quarantined file path


class PlaybookRequest(BaseModel):
    incident_id: str
    risk_score: int
    auto_execute: bool = False  # if True, actually runs the suggested actions; if False, just returns the plan


@app.get("/health")
def health():
    return {"status": "ok", "agent": "response-agent", "mode": actions.RESPONSE_MODE}


@app.post("/execute-action")
def execute_action(req: ActionRequest):
    handlers = {
        "kill_process": lambda t: actions.kill_process(int(t)),
        "block_ip": actions.block_ip,
        "quarantine_file": actions.quarantine_file,
        "disable_account": actions.disable_account,
    }
    handler = handlers.get(req.action_type)
    if not handler:
        raise HTTPException(status_code=400, detail=f"Unknown action_type: {req.action_type}")

    result = handler(req.target)
    log_entry = log_action(
        incident_id=req.incident_id,
        action_type=req.action_type,
        target=req.target,
        mode=result.mode,
        result="success" if result.success else "failed",
        detail=result.detail,
    )
    return {"result": result.to_dict(), "audit_entry": log_entry}


@app.post("/rollback-action")
def rollback_action(req: RollbackRequest):
    handlers = {
        "unblock_ip": actions.unblock_ip,
        "restore_file": actions.restore_file,
    }
    handler = handlers.get(req.action_type)
    if not handler:
        raise HTTPException(status_code=400, detail=f"Unknown rollback action_type: {req.action_type}")

    result = handler(req.target)
    log_entry = log_action(
        incident_id=req.incident_id,
        action_type=req.action_type,
        target=req.target,
        mode=result.mode,
        result="success" if result.success else "failed",
        detail=result.detail,
    )
    return {"result": result.to_dict(), "audit_entry": log_entry}


@app.post("/plan-response")
def plan_response(req: PlaybookRequest):
    """
    Returns the playbook-suggested action tier for a given risk score.
    Does NOT execute anything unless auto_execute=True and you also pass
    targets - use /execute-action for actual execution with real targets.
    """
    playbook = get_playbook(req.risk_score)
    return {
        "incident_id": req.incident_id,
        "risk_score": req.risk_score,
        "tier": playbook["tier"],
        "suggested_actions": playbook["suggested_actions"],
        "description": playbook["description"],
        "current_mode": actions.RESPONSE_MODE,
    }


@app.get("/audit-log")
def audit_log(incident_id: Optional[str] = None):
    entries = read_audit_log()
    if incident_id:
        entries = [e for e in entries if e["incident_id"] == incident_id]
    return {"entries": entries, "chain_intact": verify_chain_integrity()}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8007)

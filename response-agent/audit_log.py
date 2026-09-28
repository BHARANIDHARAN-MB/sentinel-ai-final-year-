"""
audit_log.py
-------------
Append-only JSON-lines audit trail. Every action attempt - whether it
succeeds, fails, or is only simulated - gets a permanent record. This is
what your incident reports and any post-hoc review pull from.
"""

import json
import os
import time
import hashlib

AUDIT_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "audit_log.jsonl")


def _chain_hash(prev_hash: str, entry: dict) -> str:
    """Simple hash-chaining so log tampering is detectable - each entry's hash
    depends on the previous entry's hash, like a minimal blockchain-style ledger."""
    payload = prev_hash + json.dumps(entry, sort_keys=True)
    return hashlib.sha256(payload.encode()).hexdigest()


def _last_hash() -> str:
    if not os.path.exists(AUDIT_LOG_PATH):
        return "0" * 64
    with open(AUDIT_LOG_PATH, "r") as f:
        lines = f.readlines()
    if not lines:
        return "0" * 64
    return json.loads(lines[-1]).get("entry_hash", "0" * 64)


def log_action(incident_id: str, action_type: str, target: str, mode: str, result: str, detail: str = ""):
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "incident_id": incident_id,
        "action_type": action_type,
        "target": target,
        "mode": mode,          # "simulate" or "live"
        "result": result,      # "success", "failed", "simulated"
        "detail": detail,
    }
    prev = _last_hash()
    entry_hash = _chain_hash(prev, entry)  # hash computed over the canonical entry BEFORE prev/entry hash fields are attached
    entry["prev_hash"] = prev
    entry["entry_hash"] = entry_hash

    with open(AUDIT_LOG_PATH, "a") as f:
        f.write(json.dumps(entry) + "\n")

    return entry


def read_audit_log():
    if not os.path.exists(AUDIT_LOG_PATH):
        return []
    with open(AUDIT_LOG_PATH, "r") as f:
        return [json.loads(line) for line in f if line.strip()]


def verify_chain_integrity() -> bool:
    """Walks the log and confirms no entry has been altered or removed."""
    entries = read_audit_log()
    prev = "0" * 64
    for e in entries:
        expected_prev = e["prev_hash"]
        if expected_prev != prev:
            return False
        stored_hash = e["entry_hash"]
        check_entry = {k: v for k, v in e.items() if k not in ("prev_hash", "entry_hash")}
        recomputed = _chain_hash(prev, check_entry)
        if recomputed != stored_hash:
            return False
        prev = stored_hash
    return True

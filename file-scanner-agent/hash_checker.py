"""
hash_checker.py
----------------
Computes file hashes and checks them against a local known-malicious
hash database. Swap `load_hash_db` to pull from VirusTotal / MalwareBazaar
/ AbuseCH on a schedule for production use.
"""

import hashlib
import json
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "known_malicious_hashes.json")


def load_hash_db():
    with open(DB_PATH) as f:
        data = json.load(f)
    return data.get("known_malicious_sha256", {})


HASH_DB = load_hash_db()


def sha256_of_file(filepath: str, chunk_size: int = 65536):
    h = hashlib.sha256()
    try:
        with open(filepath, "rb") as f:
            while chunk := f.read(chunk_size):
                h.update(chunk)
        return h.hexdigest()
    except (PermissionError, FileNotFoundError, OSError):
        return None


def check_hash(filepath: str):
    """Returns a finding dict if the file's hash matches a known-malicious entry, else None."""
    digest = sha256_of_file(filepath)
    if digest is None:
        return None
    label = HASH_DB.get(digest)
    if label:
        return {
            "reason": f"SHA256 hash matches known-malicious signature: {label}",
            "risk_score": 100,
            "sha256": digest,
            "strength": "strong",
        }
    return {"sha256": digest}  # no match, but return hash for the report

"""
scanner_service.py
--------------------
Sentinel AI - File Scanner Agent (Endpoint Telemetry extension)

Scans a directory tree for suspicious files using three signals:
  1. Known-malicious SHA256 hash match
  2. Heuristics: double-extension masquerade, suspicious drop locations
  3. Shannon entropy (packed/encrypted payload indicator)

Run:
    uvicorn scanner_service:app --host 0.0.0.0 --port 8005 --reload
"""

import os
import time
import threading
import uuid
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from hash_checker import check_hash
from heuristics import run_heuristics
from signature_checker import check_signature, is_trusted_publisher
from scan_jobs import start_background_scan, get_job

app = FastAPI(title="Sentinel AI - File Scanner Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- safety limits so a scan can't hang or eat the whole disk ----
MAX_FILES_PER_SCAN = 20_000
MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024  # skip files >200MB (unlikely to be a dropped payload)
DEFAULT_EXCLUDED_DIRS = {
    "node_modules", ".git", "venv", "__pycache__", "$recycle.bin",
    "windows\\winsxs", "program files\\windowsapps",
}


class ScanRequest(BaseModel):
    path: str
    recursive: bool = True
    max_files: Optional[int] = None

class FlaggedFile(BaseModel):
    path: str
    sha256: Optional[str] = None
    risk_score: int
    reasons: List[str]


class ScanResult(BaseModel):
    scan_path: str
    files_scanned: int
    files_flagged: int
    signature_cleared: int = 0  # files that would have flagged but were verified via trusted digital signature
    duration_seconds: float
    flagged_files: List[FlaggedFile]
    signature_cleared_files: List[FlaggedFile] = []  # kept for transparency, not treated as a threat


def get_common_scan_targets() -> List[str]:
    """
    Returns real, existing high-risk directories on THIS machine - Downloads,
    Desktop, Temp, and Startup - instead of a hardcoded test folder. Adjusts
    automatically for Windows vs Linux/Mac.
    """
    home = os.path.expanduser("~")
    candidates = []

    if os.name == "nt":
        userprofile = os.environ.get("USERPROFILE", home)
        appdata = os.environ.get("APPDATA", "")
        localappdata = os.environ.get("LOCALAPPDATA", "")
        candidates = [
            os.path.join(userprofile, "Downloads"),
            os.path.join(userprofile, "Desktop"),
            os.path.join(localappdata, "Temp") if localappdata else "",
            os.path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Startup") if appdata else "",
        ]
    else:
        candidates = [
            os.path.join(home, "Downloads"),
            os.path.join(home, "Desktop"),
            "/tmp",
        ]

    return [c for c in candidates if c and os.path.isdir(c)]


def is_excluded(dirpath: str) -> bool:
    lower = dirpath.lower()
    return any(marker in lower for marker in DEFAULT_EXCLUDED_DIRS)


def _scan_path(path: str, recursive: bool, limit: int, on_progress=None):
    """Core scan logic, reusable by both /scan-directory and /scan-common-folders.

    on_progress(current_file, scanned_count, flagged_count), if given, is
    called after each file is processed - this is what powers the live
    "scanning X of Y" progress endpoint.
    """
    scanned = 0
    flagged: List[FlaggedFile] = []
    cleared: List[FlaggedFile] = []

    walker = os.walk(path) if recursive else [(path, [], os.listdir(path))]

    for root, dirs, files in walker:
        if is_excluded(root):
            dirs[:] = []
            continue

        for fname in files:
            if scanned >= limit:
                break
            fpath = os.path.join(root, fname)

            try:
                if os.path.getsize(fpath) > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                continue

            scanned += 1
            findings = []  # list of {"reason", "risk_score", "strength"}
            sha256 = None

            hash_result = check_hash(fpath)
            if hash_result:
                sha256 = hash_result.get("sha256")
                if "reason" in hash_result:
                    findings.append(hash_result)

            findings.extend(run_heuristics(fpath))

            if findings:
                reasons = [f["reason"] for f in findings]
                risk = max(f["risk_score"] for f in findings)

                # Only consult the signature check when EVERY finding is a "weak"
                # signal (entropy/location). A strong signal (hash match, double-
                # extension masquerade) is never cleared by a signature - a
                # validly-signed file can still be a legitimate publisher's binary
                # being abused via a masquerade trick, so that combination stays
                # flagged rather than getting quietly waved through.
                all_weak = all(f.get("strength") == "weak" for f in findings)
                cleared_this = False
                if all_weak:
                    sig = check_signature(fpath)
                    if sig and sig.get("valid") and is_trusted_publisher(sig.get("signer", "")):
                        reasons.append(f"CLEARED: digitally signed by trusted publisher ({sig['signer'][:60]})")
                        cleared.append(FlaggedFile(path=fpath, sha256=sha256, risk_score=risk, reasons=reasons))
                        cleared_this = True

                if not cleared_this:
                    flagged.append(FlaggedFile(path=fpath, sha256=sha256, risk_score=risk, reasons=reasons))

            # Fires for EVERY file, clean or not - progress should reflect
            # files actually looked at, not just the ones that got flagged.
            if on_progress:
                on_progress(fpath, scanned, len(flagged))

        if scanned >= limit:
            break

    return scanned, flagged, cleared


@app.get("/health")
def health():
    return {"status": "ok", "agent": "file-scanner-agent"}


@app.get("/common-scan-targets")
def common_scan_targets():
    """Shows which real directories on this machine would be scanned by /scan-common-folders."""
    return {"targets": get_common_scan_targets()}


@app.post("/scan-directory", response_model=ScanResult)
def scan_directory(req: ScanRequest):
    if not os.path.exists(req.path):
        raise HTTPException(status_code=400, detail=f"Path does not exist: {req.path}")

    limit = req.max_files or MAX_FILES_PER_SCAN
    start = time.time()
    scanned, flagged, cleared = _scan_path(req.path, req.recursive, limit)

    return ScanResult(
        scan_path=req.path,
        files_scanned=scanned,
        files_flagged=len(flagged),
        signature_cleared=len(cleared),
        duration_seconds=round(time.time() - start, 3),
        flagged_files=sorted(flagged, key=lambda f: -f.risk_score),
        signature_cleared_files=cleared,
    )


@app.post("/scan-common-folders", response_model=ScanResult)
def scan_common_folders(max_files: Optional[int] = None):
    """
    Scans the real Downloads, Desktop, Temp, and Startup folders on THIS
    machine - the actual locations malware typically lands - instead of
    requiring a manually-specified test path.
    """
    targets = get_common_scan_targets()
    if not targets:
        raise HTTPException(status_code=400, detail="No common directories found on this machine")

    limit = max_files or MAX_FILES_PER_SCAN
    start = time.time()
    total_scanned = 0
    all_flagged: List[FlaggedFile] = []
    all_cleared: List[FlaggedFile] = []

    for target in targets:
        scanned, flagged, cleared = _scan_path(target, True, limit - total_scanned)
        total_scanned += scanned
        all_flagged.extend(flagged)
        all_cleared.extend(cleared)
        if total_scanned >= limit:
            break

    return ScanResult(
        scan_path=", ".join(targets),
        files_scanned=total_scanned,
        files_flagged=len(all_flagged),
        signature_cleared=len(all_cleared),
        duration_seconds=round(time.time() - start, 3),
        flagged_files=sorted(all_flagged, key=lambda f: -f.risk_score),
        signature_cleared_files=all_cleared,
    )


@app.post("/scan-common-folders/start")
def scan_common_folders_start(max_files: Optional[int] = None):
    """
    Starts a scan of the real Downloads/Desktop/Temp/Startup folders in the
    background and returns immediately with a job_id. Poll /scan-progress/{job_id}
    for live status - this is what powers the "scanning file X of Y" UI,
    which a single blocking request couldn't provide.
    """
    targets = get_common_scan_targets()
    if not targets:
        raise HTTPException(status_code=400, detail="No common directories found on this machine")

    limit = max_files or MAX_FILES_PER_SCAN
    job_id = start_background_scan(targets, _scan_path, is_excluded, limit)
    return {"job_id": job_id}


@app.get("/scan-progress/{job_id}")
def scan_progress(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Unknown job_id")
    return job


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8005)

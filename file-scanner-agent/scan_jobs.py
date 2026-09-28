"""
scan_jobs.py
--------------
Runs a scan in a background thread and exposes live progress through a
thread-safe in-memory job store. This is what lets the frontend show
"scanning file 842 of 2671: C:\\...\\somefile.exe" instead of a generic
spinner.

Design choice: a simple dict + lock, not a task queue or database. This
is a single-process demo app - the extra machinery would add failure
modes without adding real value at this scale.
"""

import os
import threading
import time
import uuid
from typing import Optional

JOBS = {}
_lock = threading.Lock()


def _new_job_id() -> str:
    return uuid.uuid4().hex[:12]


def _set(job_id: str, **kwargs):
    with _lock:
        JOBS[job_id].update(kwargs)


def get_job(job_id: str) -> Optional[dict]:
    with _lock:
        job = JOBS.get(job_id)
        return dict(job) if job else None


def _count_files(targets, is_excluded_fn, max_files_cap: int) -> int:
    """Fast pre-pass: just counts files (no hashing/heuristics) so the
    progress bar has a real denominator. Capped at max_files_cap so a
    huge folder can't make even the counting phase hang."""
    total = 0
    for target in targets:
        for root, dirs, files in os.walk(target):
            if is_excluded_fn(root):
                dirs[:] = []
                continue
            total += len(files)
            if total >= max_files_cap:
                return max_files_cap
    return total


def start_background_scan(targets, scan_path_fn, is_excluded_fn, limit: int) -> str:
    """
    Kicks off a scan in a background thread and returns a job_id
    immediately. `scan_path_fn` is scanner_service._scan_path, passed in
    to avoid a circular import.
    """
    job_id = _new_job_id()
    with _lock:
        JOBS[job_id] = {
            "status": "counting",
            "files_total": None,
            "files_scanned": 0,
            "current_file": None,
            "flagged_so_far": 0,
            "result": None,
            "error": None,
            "started_at": time.time(),
        }

    def run():
        try:
            total = _count_files(targets, is_excluded_fn, max_files_cap=limit)
            _set(job_id, status="scanning", files_total=total)

            def on_progress(current_file, scanned_count, flagged_count):
                _set(job_id, current_file=current_file, files_scanned=scanned_count, flagged_so_far=flagged_count)

            all_flagged, all_cleared, total_scanned = [], [], 0
            for target in targets:
                scanned, flagged, cleared = scan_path_fn(
                    target, True, limit - total_scanned, on_progress=on_progress
                )
                total_scanned += scanned
                all_flagged.extend(flagged)
                all_cleared.extend(cleared)
                if total_scanned >= limit:
                    break

            result = {
                "scan_path": ", ".join(targets),
                "files_scanned": total_scanned,
                "files_flagged": len(all_flagged),
                "signature_cleared": len(all_cleared),
                "duration_seconds": round(time.time() - JOBS[job_id]["started_at"], 3),
                "flagged_files": [f.dict() if hasattr(f, "dict") else f for f in sorted(all_flagged, key=lambda x: -x.risk_score)],
                "signature_cleared_files": [f.dict() if hasattr(f, "dict") else f for f in all_cleared],
            }
            _set(job_id, status="done", result=result, current_file=None)
        except Exception as e:
            _set(job_id, status="error", error=str(e))

    threading.Thread(target=run, daemon=True).start()
    return job_id

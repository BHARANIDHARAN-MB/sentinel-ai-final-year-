"""
process_monitor_service.py
-----------------------------
Sentinel AI - Process Monitoring Agent

Reads the REAL, LIVE operating system process table via psutil - not
simulated data. Flags processes using name-masquerade detection, suspicious
parent/child spawn chains, execution location, a known-bad-name blocklist,
sustained CPU usage, and network connection counts.

Run:
    uvicorn process_monitor_service:app --host 0.0.0.0 --port 8006 --reload

Note on permissions: without admin/root, psutil cannot read exe path, cmdline,
or connections for processes owned by other users - those fields come back
empty and are skipped rather than causing an error. Run as Administrator on
Windows for full visibility.
"""

import time
from typing import Optional, List

import psutil
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from process_heuristics import run_process_heuristics
from signature_checker import check_signature, is_trusted_publisher

# Kernel pseudo-processes that aren't real programs and should never be
# scanned. PID 0 (System Idle Process on Windows) reports CPU as idle time
# SUMMED ACROSS ALL CORES, so on a multi-core machine it routinely shows
# >100% (even >1000%) despite representing zero real activity - flagging it
# as "sustained high CPU" is a false positive from treating it like a normal
# process. PID 4 (System) is the Windows kernel itself.
EXCLUDED_PIDS = {0, 4}

app = FastAPI(title="Sentinel AI - Process Monitoring Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class FlaggedProcess(BaseModel):
    pid: int
    name: str
    exe: Optional[str] = None
    parent_name: Optional[str] = None
    cpu_percent: Optional[float] = None
    memory_percent: Optional[float] = None
    connection_count: Optional[int] = None
    risk_score: int
    reasons: List[str]


class ScanResult(BaseModel):
    total_processes: int
    processes_flagged: int
    signature_cleared: int = 0
    cpu_sample_seconds: float
    duration_seconds: float
    flagged_processes: List[FlaggedProcess]
    signature_cleared_processes: List[FlaggedProcess] = []


def _safe_parent_name(proc: psutil.Process) -> Optional[str]:
    try:
        parent = proc.parent()
        return parent.name() if parent else None
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return None


def _safe_connection_count(proc: psutil.Process) -> Optional[int]:
    try:
        # net_connections() is the modern psutil API; connections() is deprecated but kept as fallback
        conns = proc.net_connections(kind="inet") if hasattr(proc, "net_connections") else proc.connections(kind="inet")
        return len(conns)
    except (psutil.AccessDenied, psutil.NoSuchProcess, AttributeError):
        return None


@app.get("/health")
def health():
    return {"status": "ok", "agent": "process-monitor-agent", "live": True}


@app.get("/scan-processes", response_model=ScanResult)
def scan_processes(cpu_sample_seconds: float = 1.0):
    """
    Snapshots every currently-running process on THIS machine, samples CPU
    usage over `cpu_sample_seconds`, and runs detection heuristics against
    each one. This reads the actual OS process table live on every call.
    """
    start = time.time()
    procs = list(psutil.process_iter(["pid", "name", "exe"]))

    # Prime cpu_percent() - first call always returns 0.0/None, needs a baseline
    for p in procs:
        try:
            p.cpu_percent(interval=None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    time.sleep(cpu_sample_seconds)

    flagged: List[FlaggedProcess] = []
    cleared: List[FlaggedProcess] = []
    total = 0

    for p in procs:
        try:
            if p.pid in EXCLUDED_PIDS:
                continue
            if not p.is_running():
                continue
            total += 1
            name = p.name()
            try:
                exe = p.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                exe = None

            cpu = p.cpu_percent(interval=None)
            try:
                mem = p.memory_percent()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                mem = None

            parent_name = _safe_parent_name(p)
            conn_count = _safe_connection_count(p)

            findings = run_process_heuristics(name, exe, parent_name, cpu, conn_count)

            if findings:
                risk = max(f["risk_score"] for f in findings)
                reasons = [f["reason"] for f in findings]

                # Same principle as the File Scanner: only a process whose
                # findings are ALL weak signals (location/CPU/connections)
                # gets a chance to clear via digital signature. A masquerade
                # or blocklist match is never overridden by a signature.
                all_weak = all(f.get("strength") == "weak" for f in findings)
                cleared_this = False
                if all_weak and exe:
                    sig = check_signature(exe)
                    if sig and sig.get("valid") and is_trusted_publisher(sig.get("signer", "")):
                        reasons.append(f"CLEARED: digitally signed by trusted publisher ({sig['signer'][:60]})")
                        cleared_this = True

                proc_entry = FlaggedProcess(
                    pid=p.pid, name=name, exe=exe, parent_name=parent_name,
                    cpu_percent=round(cpu, 1) if cpu is not None else None,
                    memory_percent=round(mem, 2) if mem is not None else None,
                    connection_count=conn_count,
                    risk_score=risk,
                    reasons=reasons,
                )
                if cleared_this:
                    cleared.append(proc_entry)
                else:
                    flagged.append(proc_entry)
        except (psutil.NoSuchProcess, psutil.ZombieProcess):
            continue

    return ScanResult(
        total_processes=total,
        processes_flagged=len(flagged),
        signature_cleared=len(cleared),
        cpu_sample_seconds=cpu_sample_seconds,
        duration_seconds=round(time.time() - start, 3),
        flagged_processes=sorted(flagged, key=lambda f: -f.risk_score),
        signature_cleared_processes=cleared,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8006)

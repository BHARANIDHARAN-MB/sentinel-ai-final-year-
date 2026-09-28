"""
process_heuristics.py
-----------------------
Real-time process analysis heuristics. All functions read live data from
psutil.Process objects — nothing here is simulated or canned.

Detection signals:
  1. Process-name masquerade (e.g. a fake "svchost.exe" not in System32)
  2. Suspicious parent -> child spawn chains (Office app spawning a shell)
  3. Execution from a suspicious location (Temp/AppData/Downloads/tmp)
  4. Sustained high CPU usage (potential cryptominer / resource abuse)
  5. Known-malicious process name match (local blocklist)
  6. Excessive outbound network connections (potential C2 beacon)
"""

import os
import json
import platform

IS_WINDOWS = platform.system() == "Windows"

# ---- Windows system processes and where they're legitimately allowed to run from ----
WINDOWS_SYSTEM_PROCESS_DIRS = {
    "svchost.exe": r"c:\windows\system32",
    "csrss.exe": r"c:\windows\system32",
    "lsass.exe": r"c:\windows\system32",
    "winlogon.exe": r"c:\windows\system32",
    "services.exe": r"c:\windows\system32",
    "explorer.exe": r"c:\windows",
    "wininit.exe": r"c:\windows\system32",
    "smss.exe": r"c:\windows\system32",
    "spoolsv.exe": r"c:\windows\system32",
}

# ---- Classic malicious spawn chains: parent app -> child that shouldn't normally appear ----
SUSPICIOUS_PARENT_CHILD = {
    "winword.exe": {"powershell.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe", "certutil.exe"},
    "excel.exe": {"powershell.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe", "certutil.exe"},
    "outlook.exe": {"powershell.exe", "cmd.exe", "wscript.exe", "cscript.exe", "mshta.exe"},
    "acrord32.exe": {"powershell.exe", "cmd.exe"},
    "chrome.exe": {"powershell.exe", "cmd.exe"},
    "msedge.exe": {"powershell.exe", "cmd.exe"},
}

SUSPICIOUS_LOCATION_MARKERS = ["temp", "appdata/local/temp", "downloads", "/tmp", "/dev/shm", "$recycle.bin"]

DANGEROUS_EXE_NAMES = {".exe", ".scr"} if IS_WINDOWS else {""}

CPU_SUSTAINED_THRESHOLD = 70.0    # percent, sustained across the sampling window
MAX_CONNECTIONS_THRESHOLD = 40    # simultaneous established connections from a single process

BLOCKLIST_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "known_bad_process_names.json")


def load_blocklist():
    try:
        with open(BLOCKLIST_PATH) as f:
            return set(n.lower() for n in json.load(f).get("names", []))
    except FileNotFoundError:
        return set()


BLOCKLIST = load_blocklist()


def _normalize(path: str) -> str:
    return (path or "").lower().replace("\\", "/")


def check_masquerade(name: str, exe_path: str):
    if not IS_WINDOWS or not name:
        return None
    lname = name.lower()
    expected_dir = WINDOWS_SYSTEM_PROCESS_DIRS.get(lname)
    if expected_dir and exe_path:
        if _normalize(expected_dir) not in _normalize(exe_path):
            return {
                "reason": f"Process name '{name}' impersonates a Windows system process but is running from "
                          f"'{exe_path}' instead of the expected '{expected_dir}'",
                "risk_score": 95,
                "strength": "strong",
            }
    return None


def check_suspicious_spawn(name: str, parent_name: str):
    if not parent_name or not name:
        return None
    parent_l = parent_name.lower()
    name_l = name.lower()
    children = SUSPICIOUS_PARENT_CHILD.get(parent_l)
    if children and name_l in children:
        return {
            "reason": f"'{parent_name}' spawned '{name}' — a pattern commonly seen in malicious "
                      f"macro/document-based attacks",
            "risk_score": 90,
            "strength": "strong",
        }
    return None


def check_suspicious_location(name: str, exe_path: str):
    if not exe_path:
        return None
    ext = os.path.splitext(exe_path)[1].lower()
    norm = _normalize(exe_path)
    if IS_WINDOWS and ext not in DANGEROUS_EXE_NAMES:
        return None
    for marker in SUSPICIOUS_LOCATION_MARKERS:
        if marker in norm:
            return {
                "reason": f"Process executable running from a commonly-abused location: '{exe_path}'",
                "risk_score": 60,
                "strength": "weak",
            }
    return None


def check_blocklist(name: str):
    if not name:
        return None
    if name.lower() in BLOCKLIST:
        return {
            "reason": f"Process name '{name}' matches a known-malicious process blocklist entry",
            "risk_score": 100,
            "strength": "strong",
        }
    return None


def check_sustained_cpu(cpu_percent: float):
    if cpu_percent is not None and cpu_percent >= CPU_SUSTAINED_THRESHOLD:
        return {
            "reason": f"Sustained high CPU usage ({cpu_percent:.1f}%) — consistent with cryptomining "
                      f"or resource-abuse malware",
            "risk_score": 50,
            "strength": "weak",
        }
    return None


def check_connection_count(conn_count: int):
    if conn_count is not None and conn_count >= MAX_CONNECTIONS_THRESHOLD:
        return {
            "reason": f"Unusually high number of simultaneous network connections ({conn_count}) — "
                      f"consistent with C2 beaconing or botnet activity",
            "risk_score": 70,
            "strength": "weak",
        }
    return None


def run_process_heuristics(name, exe_path, parent_name, cpu_percent, conn_count):
    findings = []
    for result in (
        check_masquerade(name, exe_path),
        check_suspicious_spawn(name, parent_name),
        check_suspicious_location(name, exe_path),
        check_blocklist(name),
        check_sustained_cpu(cpu_percent),
        check_connection_count(conn_count),
    ):
        if result:
            findings.append(result)
    return findings

"""
heuristics.py
--------------
Signal-based (non-hash) suspicious file detectors for the File Scanner Agent.
Each function returns None (clean) or a dict describing why it flagged the file.
"""

import os
import math
from collections import Counter

# Extensions treated as inherently dangerous when found in a suspicious LOCATION
# (Temp/Downloads/Startup). Deliberately narrower than the double-extension set
# below - .js and .jar are extremely common as legitimate developer/download
# artifacts, so flagging them just for their location produced too much noise
# in testing (80+ false positives on a real machine). They're still checked
# for double-extension masquerade, just not for location alone.
DANGEROUS_LOCATION_EXTENSIONS = {".exe", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".msi"}

# Broader set used for double-extension masquerade detection (e.g. invoice.pdf.js) -
# here the masquerade pattern itself is the suspicious signal, not the extension alone
DANGEROUS_EXTENSIONS = {".exe", ".scr", ".bat", ".cmd", ".ps1", ".vbs", ".js", ".jar", ".dll", ".msi"}

# Locations that are common malware persistence/drop points (normalized, separator-agnostic)
SUSPICIOUS_PATH_MARKERS = [
    "temp", "appdata/local/temp", "appdata\\local\\temp",
    "startup", "start menu/programs/startup", "start menu\\programs\\startup",
    "downloads",
]


def _normalize(path: str) -> str:
    """Lowercase and normalize separators so markers match on both Windows and Linux paths."""
    return path.lower().replace("\\", "/")

# Common "double extension" masquerade pattern: invoice.pdf.exe, photo.jpg.scr
DOUBLE_EXT_DECOYS = {".pdf", ".jpg", ".jpeg", ".png", ".doc", ".docx", ".xls", ".xlsx", ".txt", ".mp3", ".mp4"}

MAX_ENTROPY_SCAN_BYTES = 2_000_000  # cap to avoid choking on huge files
ENTROPY_FLAG_THRESHOLD = 7.5        # out of max 8.0 for byte-level Shannon entropy


def check_double_extension(filepath: str):
    name = os.path.basename(filepath).lower()
    parts = name.split(".")
    if len(parts) >= 3:
        real_ext = "." + parts[-1]
        decoy_ext = "." + parts[-2]
        if real_ext in DANGEROUS_EXTENSIONS and decoy_ext in DOUBLE_EXT_DECOYS:
            return {
                "reason": f"Double-extension masquerade: appears to be '{decoy_ext}' but is actually '{real_ext}'",
                "risk_score": 85,
                "strength": "strong",
            }
    return None


def check_suspicious_location(filepath: str):
    norm_path = _normalize(filepath)
    path_segments = norm_path.split("/")
    ext = os.path.splitext(filepath)[1].lower()
    if ext in DANGEROUS_LOCATION_EXTENSIONS:
        for marker in SUSPICIOUS_PATH_MARKERS:
            marker_norm = _normalize(marker)
            if marker_norm in path_segments or marker_norm in norm_path:
                return {
                    "reason": f"Executable-type file ({ext}) found in commonly-abused location ('{marker}')",
                    "risk_score": 55,
                    "strength": "weak",
                }
    return None


def shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = Counter(data)
    length = len(data)
    return -sum((c / length) * math.log2(c / length) for c in counts.values())


def check_entropy(filepath: str):
    ext = os.path.splitext(filepath)[1].lower()
    # Only worth checking on executable-ish / archive-ish files; text files are naturally low entropy anyway
    if ext not in DANGEROUS_EXTENSIONS and ext not in {".zip", ".7z", ".rar"}:
        return None
    try:
        size = os.path.getsize(filepath)
        if size == 0:
            return None
        with open(filepath, "rb") as f:
            data = f.read(min(size, MAX_ENTROPY_SCAN_BYTES))
        entropy = shannon_entropy(data)
        if entropy >= ENTROPY_FLAG_THRESHOLD:
            return {
                "reason": f"High entropy ({entropy:.2f}/8.0) — consistent with packed, encrypted, or obfuscated payload",
                "risk_score": 65,
                "strength": "weak",
            }
    except (PermissionError, FileNotFoundError, OSError):
        return None
    return None


def run_heuristics(filepath: str):
    """Runs all heuristic checks and returns a list of findings (may be empty)."""
    findings = []
    for check in (check_double_extension, check_suspicious_location, check_entropy):
        result = check(filepath)
        if result:
            findings.append(result)
    return findings

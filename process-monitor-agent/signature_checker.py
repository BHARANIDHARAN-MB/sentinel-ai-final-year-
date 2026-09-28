"""
signature_checker.py
-----------------------
Checks a file's Windows Authenticode digital signature via PowerShell's
Get-AuthenticodeSignature cmdlet. This is the legitimate way to distinguish
"a real installer from a known publisher" from "malware disguised as an
installer" - something entropy and location heuristics fundamentally
cannot do on their own, since both a real Brave installer and malware
packed to look like one are high-entropy and land in Downloads.

Deliberately NOT implemented as a filename/path allowlist: an attacker can
trivially name a payload "VSCodeSetup.exe" to bypass a name-based check.
A forged Authenticode signature, by contrast, would require a stolen
code-signing certificate - a far higher bar.

Windows-only. On other platforms (or if PowerShell is unavailable), this
returns None and the calling code treats the file as unverified, which is
the safe default.
"""

import subprocess
import platform

IS_WINDOWS = platform.system() == "Windows"

# Publishers we treat as trusted enough to downgrade a WEAK-signal-only flag
# (entropy/location alone). This list only matters if the signature is also
# cryptographically Valid - an unsigned or invalid-signature file matching
# one of these names for real gets NO benefit, which is the point: identity
# claims mean nothing without a valid signature behind them.
TRUSTED_PUBLISHER_SUBSTRINGS = [
    "microsoft corporation",
    "google llc",
    "brave software",
    "bluestack",
    "epic games",
    "mozilla corporation",
    "discord inc",
]


def check_signature(filepath: str):
    """
    Returns:
        {"signed": True, "valid": True, "signer": "..."}   - validly signed
        {"signed": True, "valid": False, "signer": "..."}   - signed but invalid/tampered/expired
        {"signed": False}                                    - not signed at all
        None                                                  - couldn't check (non-Windows, PowerShell missing, timeout)
    """
    if not IS_WINDOWS:
        return None

    try:
        result = subprocess.run(
            [
                "powershell", "-NoProfile", "-Command",
                f"$sig = Get-AuthenticodeSignature -LiteralPath '{filepath}'; "
                f"Write-Output \"$($sig.Status)|$($sig.SignerCertificate.Subject)\""
            ],
            capture_output=True, text=True, timeout=8,
        )
        if result.returncode != 0 or not result.stdout.strip():
            return None

        parts = result.stdout.strip().split("|", 1)
        status = parts[0].strip()
        signer = parts[1].strip() if len(parts) > 1 else ""

        if status == "NotSigned":
            return {"signed": False}
        if status == "Valid":
            return {"signed": True, "valid": True, "signer": signer}
        # HashMismatch, NotTrusted, Expired, etc. - signed but NOT valid
        return {"signed": True, "valid": False, "signer": signer, "status": status}

    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        return None


def is_trusted_publisher(signer: str) -> bool:
    if not signer:
        return False
    signer_lower = signer.lower()
    return any(pub in signer_lower for pub in TRUSTED_PUBLISHER_SUBSTRINGS)

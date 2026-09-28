"""
to_incident_finding.py
------------------------
Converts a File Scanner Agent scan result into the `agent_findings` entry
shape expected by the Incident Report Agent (../report_service.py), so a
filesystem scan can be dropped straight into an incident report or into
the Threat Correlation Engine's evidence list.

Usage:
    python to_incident_finding.py scan_result.json
"""

import json
import sys


def scan_to_finding(scan_result: dict) -> dict:
    flagged = scan_result.get("flagged_files", [])
    if not flagged:
        return {
            "agent": "File Scanner Agent",
            "finding": f"Scanned {scan_result.get('files_scanned', 0)} files in "
                       f"{scan_result.get('scan_path', 'unknown path')}. No suspicious files detected.",
            "confidence": 0.5,
        }

    top = flagged[0]
    summary = (
        f"Scanned {scan_result.get('files_scanned', 0)} files in {scan_result.get('scan_path')}; "
        f"{len(flagged)} file(s) flagged. Highest risk: {top['path']} (score {top['risk_score']}/100) — "
        f"{'; '.join(top['reasons'])}."
    )
    # Confidence scales with the highest individual risk score seen
    confidence = round(min(top["risk_score"] / 100, 0.99), 2)

    return {
        "agent": "File Scanner Agent",
        "finding": summary,
        "confidence": confidence,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python to_incident_finding.py <scan_result.json>")
        sys.exit(1)
    with open(sys.argv[1]) as f:
        result = json.load(f)
    print(json.dumps(scan_to_finding(result), indent=2))

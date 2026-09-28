"""
to_incident_finding.py
------------------------
Converts a Process Monitoring Agent scan result into the `agent_findings`
shape expected by the Incident Report Agent, matching the same pattern as
file-scanner-agent/to_incident_finding.py.
"""

import json
import sys


def scan_to_finding(scan_result: dict) -> dict:
    flagged = scan_result.get("flagged_processes", [])
    if not flagged:
        return {
            "agent": "Process Monitoring Agent",
            "finding": f"Scanned {scan_result.get('total_processes', 0)} live processes. "
                       f"No suspicious process activity detected.",
            "confidence": 0.5,
        }

    top = flagged[0]
    summary = (
        f"Scanned {scan_result.get('total_processes', 0)} live processes; "
        f"{len(flagged)} flagged. Highest risk: '{top['name']}' (PID {top['pid']}, score {top['risk_score']}/100) "
        f"— {'; '.join(top['reasons'])}."
    )
    confidence = round(min(top["risk_score"] / 100, 0.99), 2)

    return {
        "agent": "Process Monitoring Agent",
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

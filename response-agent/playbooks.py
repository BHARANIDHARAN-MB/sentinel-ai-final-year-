"""
playbooks.py
-------------
Maps a risk score to a suggested response tier. This is intentionally
simple - a starting point matching your original "risk score determines
response" design. Extend PLAYBOOKS with your own rules as your correlation
engine matures (e.g. per-MITRE-technique playbooks).
"""

PLAYBOOKS = [
    {
        "min_risk": 90,
        "tier": "CRITICAL",
        "suggested_actions": ["kill_process", "block_ip", "quarantine_file", "disable_account"],
        "description": "Immediate containment across all vectors. Requires user/admin confirmation before disable_account.",
    },
    {
        "min_risk": 70,
        "tier": "HIGH",
        "suggested_actions": ["block_ip", "quarantine_file"],
        "description": "Contain the network/file vector; hold off on account or process actions pending review.",
    },
    {
        "min_risk": 40,
        "tier": "MEDIUM",
        "suggested_actions": ["quarantine_file"],
        "description": "Contain suspicious artifacts only; alert for manual review.",
    },
    {
        "min_risk": 0,
        "tier": "LOW",
        "suggested_actions": [],
        "description": "Log and monitor - no automatic containment action.",
    },
]


def get_playbook(risk_score: int) -> dict:
    for pb in PLAYBOOKS:
        if risk_score >= pb["min_risk"]:
            return pb
    return PLAYBOOKS[-1]

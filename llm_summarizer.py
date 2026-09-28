"""
llm_summarizer.py
------------------
Calls the Groq API (OpenAI-compatible) to turn raw multi-agent incident
data into human-readable narrative sections for the incident report.

Set GROQ_API_KEY as an environment variable (or in .env) before running.
Get a free key at https://console.groq.com/keys
"""

import os
import json
import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"  # fast, free-tier friendly; swap for openai/gpt-oss-120b for higher quality


SYSTEM_PROMPT = """You are a cybersecurity incident report writer for a Security \
Operations Center. You will be given structured JSON data produced by an \
autonomous multi-agent threat detection system (Sentinel AI). Write a formal, \
factual incident report narrative. Do NOT invent facts not present in the JSON. \
Do NOT use markdown formatting (no #, no **, no bullet dashes) - plain prose only, \
because this text will be inserted directly into a Word document.

Return ONLY valid JSON with exactly these keys, no other text:
{
  "executive_summary": "2-4 sentence high-level summary of what happened and current status",
  "detailed_narrative": "3-6 sentence chronological account of how the incident unfolded, referencing specific agent findings and their confidence levels",
  "recommendation": "2-3 sentence recommended next action for the security team, grounded in the recommendation_hint field if present"
}"""


def generate_narrative(incident_data: dict) -> dict:
    """
    Sends incident data to Groq and returns a dict with
    executive_summary, detailed_narrative, and recommendation.
    Falls back to a template-based summary if the API call fails,
    so report generation never hard-fails a demo.
    """
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return _fallback_narrative(incident_data)

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_completion_tokens": 800,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": json.dumps(incident_data, indent=2)},
                ],
            },
            timeout=30.0,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(text)
    except Exception as e:
        print(f"[llm_summarizer] Falling back to template narrative: {e}")
        return _fallback_narrative(incident_data)


def _fallback_narrative(incident_data: dict) -> dict:
    """Deterministic, non-LLM narrative so the pipeline still works without an API key.

    Built entirely from what's actually present in the incident data - does NOT
    assume a login-attempt scenario, since incidents can also come from a plain
    file/process scan with no authentication context at all. Assuming login
    context that isn't there produced factually wrong sentences in testing
    (e.g. "following a login attempt" on a scan that had no login involved).
    """
    risk = incident_data.get("risk_score", "N/A")
    login = incident_data.get("login_attempt")
    findings = incident_data.get("agent_findings", [])
    agent_names = [f.get("agent", "an agent") for f in findings]

    if login:
        source_desc = f"a login attempt from {login.get('geo_location', 'an unknown location')}"
    elif agent_names:
        source_desc = f"{', '.join(agent_names)} activity"
    else:
        source_desc = "an automated scan"

    return {
        "executive_summary": (
            f"Incident {incident_data.get('incident_id', 'N/A')} was flagged with a risk "
            f"score of {risk}/100 following {source_desc}. "
            f"{incident_data.get('status', 'Status pending review')}."
        ),
        "detailed_narrative": (
            f"Across {len(findings)} contributing agent(s) ({', '.join(agent_names) if agent_names else 'none'}), "
            f"the platform reached a combined risk score of {risk}/100. "
            + (
                "Containment actions were executed automatically based on policy thresholds."
                if incident_data.get("actions_taken")
                else "No automated containment actions were taken; this requires manual review."
            )
        ),
        "recommendation": incident_data.get(
            "recommendation_hint",
            "Review the flagged findings and confirm whether further action is required.",
        ),
    }


if __name__ == "__main__":
    with open("sample_incident.json") as f:
        incident = json.load(f)
    narrative = generate_narrative(incident)
    print(json.dumps(narrative, indent=2))

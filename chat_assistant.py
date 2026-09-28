"""
chat_assistant.py
--------------------
Backend for the voice/text chat assistant. Answers questions about
Sentinel AI and, when given scan context, about the user's actual last
scan results. Uses Groq when available; falls back to simple rule-based
responses so the chat never just breaks without an API key.
"""

import os
import json
import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"

SYSTEM_PROMPT = """You are the voice assistant for Sentinel AI, a multi-agent \
cybersecurity threat detection dashboard. You can see the user's most recent \
scan results if provided in context, including a capped list of specific \
flagged items (file names or process names with risk scores and top reason). \
Answer questions about what was found, explain risk scores and technical \
terms in plain English, and be concise - your replies may be read aloud via \
text-to-speech, so avoid long lists, markdown formatting, or special \
characters. Keep replies under 60 words unless the user asks for detail.

If asked to list or name the flagged items: do NOT read out all of them if \
there are more than 3-4 - summarize instead (e.g. "the highest risk ones were \
X and Y, plus N more lower-risk items") and point them to the Results panel \
for the full list. If the flaggedItems list in context is shorter than the \
totalFlagged count, say so rather than implying you've shown everything.

If asked to find a file, tell the user to use the "find file" voice command \
instead, since file search is handled by a separate fast local search rather \
than by you."""


def _fallback_reply(message: str, context: dict | None) -> str:
    msg = message.lower()
    is_list_request = any(w in msg for w in ["list", "which", "what are", "name them", "give", "item"])
    is_scan_question = any(
        w in msg for w in ["flagged", "found", "find", "threat", "result", "scan", "safe", "clean", "item"]
    )

    if is_scan_question:
        if context and context.get("totalFlagged") is not None:
            n = context["totalFlagged"]
            if n == 0:
                return "Your last scan found nothing suspicious. Everything came back clean."

            items = context.get("flaggedItems") or []
            if is_list_request and items:
                top = sorted(items, key=lambda i: -i.get("risk_score", 0))[:3]
                names = ", ".join(i["name"] for i in top)
                more = n - len(top)
                more_txt = f", plus {more} more" if more > 0 else ""
                return f"Highest risk: {names}{more_txt}. Open the results panel for full details on each."

            item_word = "item" if n == 1 else "items"
            return f"Your last scan flagged {n} {item_word}. Open the results panel for details on each one."
        return "Run a scan first, then ask me about the results."
    if any(w in msg for w in ["hello", "hi", "hey"]):
        return "Hi, I'm the Sentinel AI assistant. Ask me about your scan results, or say find file and a name."
    return (
        "I'm running in offline mode right now, so I can only answer questions about your scan "
        "results. For general questions, set a Groq API key on the Report Agent."
    )


def get_chat_reply(message: str, context: dict | None = None) -> str:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return _fallback_reply(message, context)

    try:
        user_content = message
        if context:
            user_content = f"Context (most recent scan): {json.dumps(context)}\n\nUser question: {message}"

        response = httpx.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_completion_tokens": 300,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_content},
                ],
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        return text.strip() or _fallback_reply(message, context)
    except Exception as e:
        print(f"[chat_assistant] Falling back: {e}")
        return _fallback_reply(message, context)

"""
query_expander.py
--------------------
Expands a search query into related keywords, so searching "resume" also
matches files named "cv" or "curriculum vitae". Uses Groq when an API
key is available (one call per search, not per file - the expensive part
is the per-file matching, which stays local and fast). Falls back to a
small hardcoded synonym dictionary so search still works without an API
key, just with less coverage.
"""

import os
import json
import httpx

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"

FALLBACK_SYNONYMS = {
    "resume": ["cv", "curriculum vitae"],
    "cv": ["resume", "curriculum vitae"],
    "invoice": ["receipt", "bill"],
    "receipt": ["invoice", "bill"],
    "photo": ["image", "picture", "img"],
    "picture": ["photo", "image", "img"],
    "presentation": ["slides", "deck", "ppt"],
    "slides": ["presentation", "deck", "ppt"],
    "report": ["doc", "document", "writeup"],
    "spreadsheet": ["excel", "sheet", "xlsx"],
    "notes": ["notepad", "memo"],
    "screenshot": ["screencap", "capture", "snip"],
}


def expand_query(query: str) -> list:
    api_key = os.environ.get("GROQ_API_KEY")
    query_lower = query.lower().strip()

    if not api_key:
        return FALLBACK_SYNONYMS.get(query_lower, [])

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": MODEL,
                "max_completion_tokens": 100,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "The user is searching their computer for a file by a rough name or "
                            "description. Given their search term, return a JSON array of up to 5 "
                            "alternative filename keywords a real file with this content might use "
                            "(synonyms, abbreviations, common naming conventions). Return ONLY the "
                            "JSON array, nothing else. Example: for 'resume' return "
                            '["cv", "curriculum vitae", "resume_final", "biodata"]'
                        ),
                    },
                    {"role": "user", "content": query},
                ],
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        text = text.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        keywords = json.loads(text)
        return keywords if isinstance(keywords, list) else []
    except Exception as e:
        print(f"[query_expander] Falling back to dictionary: {e}")
        return FALLBACK_SYNONYMS.get(query_lower, [])

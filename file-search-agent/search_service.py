"""
search_service.py
--------------------
Sentinel AI - File Search Agent

Finds files AND folders on the real filesystem by name, with fuzzy
tolerance for typos and partial names, optional LLM-assisted keyword
expansion, and optional filtering to just images, just videos, just
documents, or just folders.

Run:
    uvicorn search_service:app --host 0.0.0.0 --port 8008 --reload
"""

from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from fuzzy_search import search_files, get_default_search_roots, DEFAULT_MAX_RESULTS, VALID_CATEGORIES
from query_expander import expand_query

app = FastAPI(title="Sentinel AI - File Search Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class SearchRequest(BaseModel):
    query: str
    search_roots: Optional[List[str]] = None
    max_results: int = DEFAULT_MAX_RESULTS
    expand_query: bool = True  # set False to skip the LLM/dictionary expansion step
    category: str = "any"  # "any" | "image" | "video" | "document" | "folder" | "other"


class SearchResultItem(BaseModel):
    path: str
    filename: str
    match_type: str
    similarity: float
    category: str
    size_bytes: Optional[int] = None
    modified_time: Optional[float] = None


class SearchResponse(BaseModel):
    query: str
    category: str
    expanded_keywords: List[str]
    files_scanned: int
    duration_seconds: float
    results: List[SearchResultItem]


@app.get("/health")
def health():
    return {"status": "ok", "agent": "file-search-agent"}


@app.get("/default-search-roots")
def default_search_roots():
    return {"roots": get_default_search_roots()}


@app.post("/search-file", response_model=SearchResponse)
def search_file(req: SearchRequest):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query cannot be empty")

    category = req.category if req.category in VALID_CATEGORIES else "any"

    # Folder searches and generic "any" searches benefit from keyword
    # expansion; skip the LLM/dictionary call for pure media lookups where
    # synonyms rarely help (nobody names a photo "img_2847.jpg" -> "picture").
    keywords = expand_query(req.query) if req.expand_query and category in ("any", "folder", "document") else []

    matches, scanned, duration = search_files(
        query=req.query,
        search_roots=req.search_roots,
        extra_keywords=keywords,
        max_results=req.max_results,
        category_filter=category,
    )

    results = [
        SearchResultItem(
            path=m.path, filename=m.filename, match_type=m.match_type,
            similarity=m.similarity, category=m.category,
            size_bytes=m.size_bytes, modified_time=m.modified_time,
        )
        for m in matches
    ]

    return SearchResponse(
        query=req.query,
        category=category,
        expanded_keywords=keywords,
        files_scanned=scanned,
        duration_seconds=duration,
        results=results,
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8008)

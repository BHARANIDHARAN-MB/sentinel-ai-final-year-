"""
fuzzy_search.py
-----------------
Searches the real filesystem for files AND folders matching a query name,
ranking results by match quality:
  1. exact       - name matches exactly (case-insensitive)
  2. partial     - query is a substring of the name
  3. similar     - name is textually close to the query (typos,
                   near-misses) via difflib's SequenceMatcher

Each result is tagged with a category (image, video, document, folder,
other) so the caller can filter to "just pictures" or "just videos"
without a separate code path - it's the same walk, just tagged.

This is deliberately NOT an LLM-per-file lookup - that would be far too
slow across thousands of files. Fuzzy string matching gives "AI-ish"
tolerance (typos, partial names) at real search speed. An LLM is used
separately, once, to expand the query into related keywords (see
query_expander.py) - that's the one place an LLM call actually adds value
without a per-file cost.
"""

import os
import difflib
import time
from dataclasses import dataclass
from typing import List, Optional

MAX_FILES_SCANNED = 60_000
DEFAULT_MAX_RESULTS = 25
SIMILARITY_THRESHOLD = 0.55  # difflib ratio below this isn't shown as "similar"

EXCLUDED_DIR_MARKERS = {
    "node_modules", ".git", "venv", "__pycache__", "$recycle.bin",
    "windows\\winsxs", "program files\\windowsapps", "appdata\\local\\packages",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".heic", ".heif", ".tiff", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".wmv", ".flv", ".webm", ".m4v", ".3gp"}
DOCUMENT_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".rtf"}

VALID_CATEGORIES = {"image", "video", "document", "folder", "other", "any"}


def categorize(ext: str) -> str:
    ext = ext.lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in DOCUMENT_EXTENSIONS:
        return "document"
    return "other"


def is_excluded_dir(dirpath: str) -> bool:
    lower = dirpath.lower()
    return any(marker in lower for marker in EXCLUDED_DIR_MARKERS)


@dataclass
class SearchMatch:
    path: str
    filename: str
    match_type: str  # "exact" | "partial" | "similar"
    similarity: float
    category: str  # "image" | "video" | "document" | "folder" | "other"
    size_bytes: Optional[int] = None
    modified_time: Optional[float] = None


def get_default_search_roots() -> List[str]:
    """Real user-facing directories - not the whole filesystem, which would
    be both slow and mostly irrelevant (system files aren't what someone
    means by 'find my file')."""
    home = os.path.expanduser("~")
    if os.name == "nt":
        userprofile = os.environ.get("USERPROFILE", home)
        candidates = [
            os.path.join(userprofile, "Downloads"),
            os.path.join(userprofile, "Desktop"),
            os.path.join(userprofile, "Documents"),
            os.path.join(userprofile, "Pictures"),
            os.path.join(userprofile, "Videos"),
        ]
    else:
        candidates = [
            os.path.join(home, "Downloads"),
            os.path.join(home, "Desktop"),
            os.path.join(home, "Documents"),
            os.path.join(home, "Pictures"),
            os.path.join(home, "Videos"),
        ]
    return [c for c in candidates if os.path.isdir(c)]


def _match_score(name_lower: str, name_no_ext: str, all_terms: List[str]):
    """Returns (match_type, similarity) or (None, 0.0) if nothing matched."""
    best_match_type = None
    best_similarity = 0.0
    for term in all_terms:
        if name_lower == term:
            return "exact", 1.0
        if term in name_lower:
            if best_match_type != "exact":
                best_match_type = "partial"
                best_similarity = max(best_similarity, len(term) / max(len(name_lower), 1))
            continue
        ratio = difflib.SequenceMatcher(None, term, name_no_ext).ratio()
        if ratio >= SIMILARITY_THRESHOLD and best_match_type is None:
            best_match_type = "similar"
            best_similarity = max(best_similarity, ratio)
    return best_match_type, best_similarity


def search_files(
    query: str,
    search_roots: Optional[List[str]] = None,
    extra_keywords: Optional[List[str]] = None,
    max_results: int = DEFAULT_MAX_RESULTS,
    max_files: int = MAX_FILES_SCANNED,
    category_filter: str = "any",
):
    """
    Searches for files AND folders matching `query` (and optionally
    `extra_keywords`, e.g. synonyms from query_expander). Set
    category_filter to "image", "video", "document", "folder", or "other"
    to restrict results to just that type; "any" (default) returns
    everything. Returns (matches, files_scanned, duration_seconds).
    """
    if category_filter not in VALID_CATEGORIES:
        category_filter = "any"

    roots = search_roots or get_default_search_roots()
    query_lower = query.lower().strip()
    query_no_ext = os.path.splitext(query_lower)[0]
    all_terms = [query_lower, query_no_ext] + [k.lower() for k in (extra_keywords or [])]
    all_terms = list(dict.fromkeys(t for t in all_terms if t))  # dedupe, drop empties

    start = time.time()
    scanned = 0
    matches: List[SearchMatch] = []
    seen_paths = set()

    for root in roots:
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            if is_excluded_dir(dirpath):
                dirnames[:] = []
                continue

            # --- folder matching ---
            if category_filter in ("any", "folder"):
                for dname in dirnames:
                    dname_lower = dname.lower()
                    match_type, similarity = _match_score(dname_lower, dname_lower, all_terms)
                    if match_type:
                        dpath = os.path.join(dirpath, dname)
                        if dpath in seen_paths:
                            continue
                        try:
                            mtime = os.path.getmtime(dpath)
                        except OSError:
                            mtime = None
                        matches.append(SearchMatch(
                            path=dpath, filename=dname, match_type=match_type,
                            similarity=round(similarity, 3), category="folder",
                            size_bytes=None, modified_time=mtime,
                        ))
                        seen_paths.add(dpath)

            # --- file matching ---
            for fname in filenames:
                if scanned >= max_files:
                    break
                scanned += 1

                fname_lower = fname.lower()
                fname_no_ext = os.path.splitext(fname_lower)[0]
                ext = os.path.splitext(fname_lower)[1]
                category = categorize(ext)

                if category_filter not in ("any",) and category_filter != category:
                    continue

                fpath = os.path.join(dirpath, fname)
                if fpath in seen_paths:
                    continue

                match_type, similarity = _match_score(fname_lower, fname_no_ext, all_terms)

                if match_type:
                    try:
                        stat = os.stat(fpath)
                        size, mtime = stat.st_size, stat.st_mtime
                    except OSError:
                        size, mtime = None, None

                    matches.append(SearchMatch(
                        path=fpath, filename=fname, match_type=match_type,
                        similarity=round(similarity, 3), category=category,
                        size_bytes=size, modified_time=mtime,
                    ))
                    seen_paths.add(fpath)

            if scanned >= max_files:
                break
        if scanned >= max_files:
            break

    # Rank: exact first, then partial, then similar; within each tier, higher similarity first
    rank_order = {"exact": 0, "partial": 1, "similar": 2}
    matches.sort(key=lambda m: (rank_order[m.match_type], -m.similarity))

    return matches[:max_results], scanned, round(time.time() - start, 3)

import re
from typing import Optional, Tuple
from urllib.parse import urlparse

INVISIBLE_CHARS_RE = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff]")

LC_RESERVED_PATHS = {
    "problemset",
    "problems",
    "problem-list",
    "contest",
    "discuss",
    "explore",
    "store",
    "playground",
    "accounts",
    "settings",
    "subscribe",
    "login",
    "signup",
    "profile",
    "u",
    "dashboard",
    "assessment",
    "interview",
    "studyplan",
    "company",
    "tag",
    "support",
    "jobs",
    "bugbounty",
    "terms",
    "privacy",
}

GH_RESERVED_PATHS = {
    "login",
    "signup",
    "join",
    "dashboard",
    "settings",
    "explore",
    "marketplace",
    "pulls",
    "issues",
    "notifications",
    "new",
    "organizations",
    "orgs",
    "topics",
    "trending",
    "collections",
    "events",
    "sponsors",
    "features",
    "pricing",
    "security",
    "about",
    "contact",
    "search",
    "codespaces",
    "copilot",
    "account",
    "profile",
    "users",
    "home",
    "site",
    "readme",
    "customer-stories",
    "enterprise",
    "team",
}

LC_USERNAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,50}$")
GH_USERNAME_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$")


def _clean_raw_input(raw_url: Optional[str]) -> str:
    if raw_url is None:
        return ""
    cleaned = INVISIBLE_CHARS_RE.sub("", str(raw_url)).strip()
    if cleaned.lower() in {"", "nan", "none", "null", "na", "n/a", "-", "."}:
        return ""
    return cleaned


def validate_leetcode_url(raw_url: Optional[str]) -> Tuple[Optional[str], Optional[str], str, Optional[str]]:
    """
    Validate and extract a clean LeetCode username and canonical profile URL.
    Returns (username, clean_url, status, error_reason).
    Status is one of: 'PENDING', 'INVALID_URL', 'MISSING'.
    """
    cleaned = _clean_raw_input(raw_url)
    if not cleaned:
        return None, None, "MISSING", "No URL provided"

    if not re.match(r"^https?://", cleaned, re.IGNORECASE):
        return None, None, "INVALID_URL", "Not a valid HTTP/HTTPS URL"

    # Strip trailing punctuation that sometimes leaks into spreadsheets (e.g. trailing ';')
    cleaned_for_parse = cleaned.rstrip(";` ")
    parsed = urlparse(cleaned_for_parse)
    host = (parsed.hostname or "").lower()
    if host not in {"leetcode.com", "www.leetcode.com"}:
        return None, None, "INVALID_URL", f"Wrong domain ({host or 'unknown'})"

    raw_segments = [INVISIBLE_CHARS_RE.sub("", seg).strip() for seg in parsed.path.split("/")]
    segments = [seg for seg in raw_segments if seg]

    if len(segments) == 2 and segments[0].lower() == "u":
        candidate = segments[1]
    elif len(segments) == 1:
        candidate = segments[0]
    else:
        return None, None, "INVALID_URL", "Not a direct LeetCode profile URL"

    candidate = candidate.rstrip(";` ")
    if candidate.lower() in LC_RESERVED_PATHS:
        return None, None, "INVALID_URL", f"Generic LeetCode page (/{candidate})"

    if not LC_USERNAME_RE.match(candidate):
        return None, None, "INVALID_URL", "Invalid LeetCode username characters"

    clean_url = f"https://leetcode.com/u/{candidate}/"
    return candidate, clean_url, "PENDING", None


def validate_github_url(raw_url: Optional[str]) -> Tuple[Optional[str], Optional[str], str, Optional[str]]:
    """
    Validate and extract a clean GitHub username and canonical profile URL.
    Returns (username, clean_url, status, error_reason).
    Status is one of: 'PENDING', 'INVALID_URL', 'MISSING'.
    """
    cleaned = _clean_raw_input(raw_url)
    if not cleaned:
        return None, None, "MISSING", "No URL provided"

    if not re.match(r"^https?://", cleaned, re.IGNORECASE):
        return None, None, "INVALID_URL", "Not a valid HTTP/HTTPS URL"

    cleaned_for_parse = cleaned.rstrip(";` ")
    parsed = urlparse(cleaned_for_parse)
    host = (parsed.hostname or "").lower()
    if host not in {"github.com", "www.github.com"}:
        return None, None, "INVALID_URL", f"Wrong domain ({host or 'unknown'})"

    raw_segments = [INVISIBLE_CHARS_RE.sub("", seg).strip() for seg in parsed.path.split("/")]
    segments = [seg for seg in raw_segments if seg]

    if len(segments) != 1:
        if len(segments) == 0:
            return None, None, "INVALID_URL", "Homepage URL with no username"
        return None, None, "INVALID_URL", "Repository or non-profile GitHub path"

    candidate = segments[0].rstrip(";` ")
    if candidate.lower() in GH_RESERVED_PATHS:
        return None, None, "INVALID_URL", f"Generic GitHub page (/{candidate})"

    if not GH_USERNAME_RE.match(candidate):
        return None, None, "INVALID_URL", "Invalid GitHub username format"

    clean_url = f"https://github.com/{candidate}"
    return candidate, clean_url, "PENDING", None

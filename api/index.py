import os
import sys
from urllib.parse import parse_qs

# Ensure both repository root and backend directory are in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

for p in (ROOT_DIR, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.main import app as base_app


class VercelPathNormalizer:
    """
    ASGI middleware for Vercel serverless functions:
    Normalizes the request path whether Vercel passes:
    1. The original client path in x-matched-path / x-forwarded-uri (/api/v1/dashboard/summary)
    2. A rewritten file path (/api/index.py or /api/index)
    3. A path stripped of /api (/v1/dashboard/summary or /dashboard/summary)
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            path = scope.get("path", "")

            # If Vercel rewrote to /api/index.py or /api, retrieve the original client path from headers
            for h in (b"x-matched-path", b"x-forwarded-uri", b"x-original-uri", b"x-invoke-path"):
                if h in headers:
                    val = headers[h].decode("latin1", errors="ignore").split("?")[0].strip()
                    if val and not val.endswith("index.py") and val != "/api":
                        path = val
                        break

            # Handle query string routing parameters if present
            query_string = scope.get("query_string", b"").decode("latin1", errors="ignore")
            if path in ("/api/index.py", "/api/index", "/api") and query_string:
                qs = parse_qs(query_string)
                if "path" in qs and qs["path"][0]:
                    path = "/" + qs["path"][0].lstrip("/")
                elif "match" in qs and qs["match"][0]:
                    path = "/" + qs["match"][0].lstrip("/")

            # Normalize path prefixes so routes match regardless of how Vercel routes them
            if path.startswith("/v1/"):
                path = "/api" + path
            elif path == "/v1":
                path = "/api/v1"
            elif path.startswith("/dashboard/") or path.startswith("/stats/") or path.startswith("/leaderboard") or path.startswith("/students/"):
                path = "/api/v1" + path

            scope["path"] = path

        await self.app(scope, receive, send)


# Expose top-level FastAPI instance wrapped with normalizer for Vercel
app = VercelPathNormalizer(base_app)

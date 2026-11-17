import os
import sys
from urllib.parse import parse_qs, urlencode
from starlette.types import ASGIApp, Receive, Scope, Send

# Ensure both repository root and backend directory are in sys.path
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT_DIR, "backend")

for p in (ROOT_DIR, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.main import app as fastapi_app


class VercelPathNormalizerMiddleware:
    """
    ASGI middleware for Vercel Serverless Functions:
    Recovers and normalizes the client request path whether Vercel passes:
    1. A rewrite to /api/index.py with query parameter ?__path=... or ?path=...
    2. Vercel headers (x-vercel-original-url, x-matched-path, x-forwarded-uri, x-now-route-matches)
    3. A path stripped of /api prefix (/v1/dashboard/summary)
    4. Direct /api/v1/... path
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope.get("type") in ("http", "websocket"):
            headers = dict(scope.get("headers", []))
            path = scope.get("path", "")
            query_string = scope.get("query_string", b"").decode("latin1", errors="ignore")

            # 1. Recover original path if Vercel invoked /api/index.py or bare /api
            recovered_path = None

            # A. Check query string parameters (__path, path, match)
            if query_string:
                qs = parse_qs(query_string)
                for param in ("__path", "path", "match"):
                    if param in qs and qs[param][0]:
                        val = qs[param][0].strip()
                        if val and not val.endswith("index.py"):
                            clean_val = val.lstrip("/")
                            if clean_val.startswith("api/"):
                                recovered_path = "/" + clean_val
                            else:
                                recovered_path = "/api/" + clean_val
                            # Remove the routing parameter so route handlers don't see it
                            qs.pop(param, None)
                            new_qs = urlencode(qs, doseq=True)
                            scope["query_string"] = new_qs.encode("latin1")
                            break

            # B. If not in query string, inspect Vercel headers
            if not recovered_path and path in ("/api/index.py", "/api/index", "/index.py", "/index", "/api", "/"):
                for h in (
                    b"x-vercel-original-url",
                    b"x-matched-path",
                    b"x-forwarded-uri",
                    b"x-original-uri",
                    b"x-invoke-path",
                ):
                    if h in headers:
                        val = headers[h].decode("latin1", errors="ignore").split("?")[0].strip()
                        if val and not val.endswith("index.py") and val != "/api":
                            recovered_path = val
                            break

                # C. Check x-now-route-matches (e.g. 1=v1%2Fdashboard%2Fsummary)
                if not recovered_path and b"x-now-route-matches" in headers:
                    matches = headers[b"x-now-route-matches"].decode("latin1", errors="ignore")
                    qs_m = parse_qs(matches)
                    for k, vals in qs_m.items():
                        if vals and vals[0] and not vals[0].endswith("index.py"):
                            recovered_path = "/" + vals[0].lstrip("/")
                            break

            final_path = recovered_path if recovered_path else path

            # 2. Normalize path prefixes so routes match regardless of incoming shape
            if final_path.startswith("/v1/"):
                final_path = "/api" + final_path
            elif final_path == "/v1":
                final_path = "/api/v1"
            elif final_path.startswith(("/dashboard/", "/stats/", "/leaderboard", "/students/", "/admin/")):
                final_path = "/api/v1" + final_path

            scope["path"] = final_path

        await self.app(scope, receive, send)


# Add the normalizer middleware to FastAPI
fastapi_app.add_middleware(VercelPathNormalizerMiddleware)

# Top-level app instance for Vercel
app = fastapi_app

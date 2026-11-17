import os
import sys
from pathlib import Path

# Add both backend and repo root to sys.path
api_dir = Path(__file__).resolve().parent
repo_root = api_dir.parent
backend_dir = repo_root / "backend"

for p in (str(backend_dir), str(repo_root)):
    if p not in sys.path:
        sys.path.insert(0, p)

import main

# Explicit top-level FastAPI instance for Vercel AST parser
app = main.app

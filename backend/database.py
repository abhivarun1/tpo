from pathlib import Path
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

# Clean and normalize DATABASE_URL
raw_db_url = os.getenv("DATABASE_URL", "").strip().strip("'\"")
db_config_error = None

if not raw_db_url:
    if os.environ.get("VERCEL"):
        db_config_error = "DATABASE_URL is not configured in Vercel Environment Variables"
        # In-memory SQLite placeholder to allow module imports and diagnostics without crash
        DATABASE_URL = "sqlite:///:memory:"
    else:
        # Default to local SQLite database file
        db_file = (BACKEND_DIR / "cse_rank.db").resolve()
        DATABASE_URL = f"sqlite:///{db_file.as_posix()}"
elif raw_db_url.startswith("sqlite:///./"):
    rel_path = raw_db_url[len("sqlite:///./") :]
    db_file = (BACKEND_DIR / rel_path).resolve()
    DATABASE_URL = f"sqlite:///{db_file.as_posix()}"
elif raw_db_url.startswith("sqlite:///"):
    DATABASE_URL = raw_db_url
elif raw_db_url.startswith("postgres://"):
    # Normalize legacy Heroku/Vercel/Supabase postgres:// scheme to postgresql+psycopg2://
    normalized = "postgresql+psycopg2://" + raw_db_url[len("postgres://"):]
    DATABASE_URL = normalized
elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+"):
    # Ensure psycopg2 driver is explicitly used for Supabase / PostgreSQL URLs
    normalized = "postgresql+psycopg2://" + raw_db_url[len("postgresql://"):]
    DATABASE_URL = normalized
else:
    DATABASE_URL = raw_db_url

raw_excel_path = os.getenv("EXCEL_DATASET_PATH", "../CSE_Rank_Clean_Student_Dataset.xlsx")
excel_candidate = Path(raw_excel_path)
if not excel_candidate.is_absolute():
    excel_candidate = (BACKEND_DIR / excel_candidate).resolve()
DEFAULT_EXCEL_PATH = excel_candidate

is_sqlite = DATABASE_URL.startswith("sqlite")
if is_sqlite:
    connect_args = {"check_same_thread": False}
else:
    connect_args = {"sslmode": "require"} if "sslmode" not in DATABASE_URL.lower() else {}

engine_kwargs = {"future": True, "connect_args": connect_args}

if not is_sqlite:
    # Optimized pool configuration for serverless PostgreSQL (Supabase / Neon)
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 300,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()

_tables_created = False


def ensure_tables_exist():
    global _tables_created
    if db_config_error:
        raise RuntimeError(db_config_error)
    if not _tables_created:
        try:
            Base.metadata.create_all(bind=engine)
            _tables_created = True
        except Exception as exc:
            print(f"Warning: ensure_tables_exist failed: {exc}")
            raise


def get_db():
    if db_config_error:
        raise RuntimeError(db_config_error)
    ensure_tables_exist()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

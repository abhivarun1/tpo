from pathlib import Path
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

raw_db_url = os.getenv("DATABASE_URL", "").strip()

if not raw_db_url:
    # Default to local SQLite database file
    db_file = (BACKEND_DIR / "cse_rank.db").resolve()
    DATABASE_URL = f"sqlite:///{db_file.as_posix()}"
elif raw_db_url.startswith("sqlite:///./"):
    rel_path = raw_db_url[len("sqlite:///./") :]
    db_file = (BACKEND_DIR / rel_path).resolve()
    DATABASE_URL = f"sqlite:///{db_file.as_posix()}"
elif raw_db_url.startswith("postgres://"):
    # Fix Heroku/Vercel/Neon legacy postgres:// schema for SQLAlchemy
    converted = raw_db_url.replace("postgres://", "postgresql://", 1)
    try:
        import psycopg2  # type: ignore # noqa: F401
        DATABASE_URL = converted.replace("postgresql://", "postgresql+psycopg2://", 1)
    except ImportError:
        DATABASE_URL = converted
elif raw_db_url.startswith("postgresql://") and not raw_db_url.startswith("postgresql+"):
    try:
        import psycopg2  # type: ignore # noqa: F401
        DATABASE_URL = raw_db_url.replace("postgresql://", "postgresql+psycopg2://", 1)
    except ImportError:
        DATABASE_URL = raw_db_url
else:
    DATABASE_URL = raw_db_url

raw_excel_path = os.getenv("EXCEL_DATASET_PATH", "../CSE_Rank_Clean_Student_Dataset.xlsx")
excel_candidate = Path(raw_excel_path)
if not excel_candidate.is_absolute():
    excel_candidate = (BACKEND_DIR / excel_candidate).resolve()
DEFAULT_EXCEL_PATH = excel_candidate

is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if is_sqlite else {}
engine_kwargs = {"future": True, "connect_args": connect_args}

if not is_sqlite:
    # Serverless database connection optimizations (PostgreSQL / Neon / Supabase)
    engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_recycle": 300,
    })

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

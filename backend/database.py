from pathlib import Path
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

raw_db_url = os.getenv("DATABASE_URL", "sqlite:///./cse_rank.db")
if raw_db_url.startswith("sqlite:///./"):
    rel_path = raw_db_url[len("sqlite:///./") :]
    db_file = (BACKEND_DIR / rel_path).resolve()
    DATABASE_URL = f"sqlite:///{db_file.as_posix()}"
else:
    DATABASE_URL = raw_db_url

raw_excel_path = os.getenv("EXCEL_DATASET_PATH", "../CSE_Rank_Clean_Student_Dataset.xlsx")
excel_candidate = Path(raw_excel_path)
if not excel_candidate.is_absolute():
    excel_candidate = (BACKEND_DIR / excel_candidate).resolve()
DEFAULT_EXCEL_PATH = excel_candidate

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

import os
from pathlib import Path
from dotenv import load_dotenv

ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "CSE_TP_Admin@2026!")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./cse_rank.db")
EXCEL_DATASET_PATH = os.getenv("EXCEL_DATASET_PATH", "../CSE_Rank_Clean_Student_Dataset.xlsx")

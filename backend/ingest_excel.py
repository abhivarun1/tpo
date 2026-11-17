from pathlib import Path
from typing import Any, Dict
from sqlalchemy.orm import Session

from app.services.excel_importer import ingest_single_excel_file, scan_and_ingest_folder


def ingest_excel_file(db: Session, excel_path: Path) -> Dict[str, Any]:
    """
    Ingest student rows from Excel workbook supporting multi-sheet processing,
    flexible column mapping, URL cleaning & validation, upserting, and audit logging.
    """
    return ingest_single_excel_file(db, excel_path, auto_sync=False)

from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Any, Dict, List
import pandas as pd
from sqlalchemy.orm import Session

from database import Base, DEFAULT_EXCEL_PATH, SessionLocal, engine
from models import AuditLog, Student
from ranking import get_or_create_settings, recalculate_all_rankings
from url_cleaner import validate_github_url, validate_leetcode_url
from app.services.excel_importer import ingest_single_excel_file, scan_and_ingest_folder

EXPECTED_SHEET = "Students"


def _clean_cell(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() == "nan":
        return ""
    return s


def ingest_excel_file(db: Session, excel_path: Path) -> Dict[str, Any]:
    """
    Ingest student rows from Excel workbook supporting multi-sheet processing,
    flexible column mapping, URL cleaning & validation, upserting, and audit logging.
    """
    return ingest_single_excel_file(db, excel_path, auto_sync=False)
    if not excel_path.exists():
        raise FileNotFoundError(f"Excel dataset not found at: {excel_path}")

    df = pd.read_excel(
        excel_path,
        sheet_name=EXPECTED_SHEET,
        dtype=str,
        keep_default_na=False,
        engine="openpyxl",
    )

    required_cols = {
        "Roll Number",
        "Student Name",
        "Batch",
        "LeetCode URL",
        "GitHub URL",
        "Profile Link Status",
    }
    missing_cols = required_cols - set(df.columns)
    if missing_cols:
        raise ValueError(f"Missing required columns in '{EXPECTED_SHEET}': {sorted(missing_cols)}")

    existing_map = {s.roll_number: s for s in db.query(Student).all()}

    inserted = 0
    updated = 0
    batches: Dict[str, int] = {}

    lc_stats = {"valid": 0, "invalid_url": 0, "missing": 0}
    gh_stats = {"valid": 0, "invalid_url": 0, "missing": 0}
    sample_lc_invalid: List[Dict[str, str]] = []
    sample_gh_invalid: List[Dict[str, str]] = []

    both_valid = 0
    one_valid = 0
    no_valid = 0

    seen_rolls = set()

    for _, row in df.iterrows():
        roll_number = _clean_cell(row.get("Roll Number")).upper()
        if not roll_number or roll_number in seen_rolls:
            continue
        seen_rolls.add(roll_number)

        name = _clean_cell(row.get("Student Name")) or roll_number
        batch = _clean_cell(row.get("Batch")) or "Unknown"
        excel_link_status = _clean_cell(row.get("Profile Link Status")) or None
        lc_raw_url = _clean_cell(row.get("LeetCode URL")) or None
        gh_raw_url = _clean_cell(row.get("GitHub URL")) or None
        # CodeChef URL is intentionally ignored per specification.

        batches[batch] = batches.get(batch, 0) + 1

        lc_user, lc_clean, lc_val_status, lc_err = validate_leetcode_url(lc_raw_url)
        gh_user, gh_clean, gh_val_status, gh_err = validate_github_url(gh_raw_url)

        if lc_val_status == "PENDING":
            lc_stats["valid"] += 1
        elif lc_val_status == "INVALID_URL":
            lc_stats["invalid_url"] += 1
            if len(sample_lc_invalid) < 25:
                sample_lc_invalid.append(
                    {
                        "roll_number": roll_number,
                        "name": name,
                        "raw_url": lc_raw_url or "",
                        "reason": lc_err or "Invalid URL",
                    }
                )
        else:
            lc_stats["missing"] += 1

        if gh_val_status == "PENDING":
            gh_stats["valid"] += 1
        elif gh_val_status == "INVALID_URL":
            gh_stats["invalid_url"] += 1
            if len(sample_gh_invalid) < 25:
                sample_gh_invalid.append(
                    {
                        "roll_number": roll_number,
                        "name": name,
                        "raw_url": gh_raw_url or "",
                        "reason": gh_err or "Invalid URL",
                    }
                )
        else:
            gh_stats["missing"] += 1

        valid_count = int(lc_val_status == "PENDING") + int(gh_val_status == "PENDING")
        if valid_count == 2:
            both_valid += 1
        elif valid_count == 1:
            one_valid += 1
        else:
            no_valid += 1

        student = existing_map.get(roll_number)
        if student is None:
            student = Student(
                roll_number=roll_number,
                name=name,
                batch=batch,
                excel_link_status=excel_link_status,
                lc_raw_url=lc_raw_url,
                lc_clean_url=lc_clean,
                lc_username=lc_user,
                lc_status=lc_val_status,
                lc_error_message=lc_err,
                gh_raw_url=gh_raw_url,
                gh_clean_url=gh_clean,
                gh_username=gh_user,
                gh_status=gh_val_status,
                gh_error_message=gh_err,
            )
            db.add(student)
            existing_map[roll_number] = student
            inserted += 1
        else:
            student.name = name
            student.batch = batch
            student.excel_link_status = excel_link_status

            # Preserve VERIFIED LeetCode data only if username is unchanged
            student.lc_raw_url = lc_raw_url
            if not (student.lc_status == "VERIFIED" and student.lc_username == lc_user and lc_val_status == "PENDING"):
                student.lc_clean_url = lc_clean
                student.lc_username = lc_user
                student.lc_status = lc_val_status
                student.lc_error_message = lc_err
                if lc_val_status != "PENDING":
                    student.lc_total_solved = None
                    student.lc_easy_solved = None
                    student.lc_medium_solved = None
                    student.lc_hard_solved = None
                    student.lc_contest_rating = None
                    student.lc_contests_attended = None
                    student.lc_raw_index = None
                    student.lc_score = None
                    student.lc_last_updated = None

            # Preserve VERIFIED GitHub data only if username is unchanged
            student.gh_raw_url = gh_raw_url
            if not (student.gh_status == "VERIFIED" and student.gh_username == gh_user and gh_val_status == "PENDING"):
                student.gh_clean_url = gh_clean
                student.gh_username = gh_user
                student.gh_status = gh_val_status
                student.gh_error_message = gh_err
                if gh_val_status != "PENDING":
                    student.gh_public_repos = None
                    student.gh_original_repos = None
                    student.gh_total_stars = None
                    student.gh_followers = None
                    student.gh_recent_active_repos_90d = None
                    student.gh_top_languages = None
                    student.gh_distinct_languages_count = None
                    student.gh_raw_index = None
                    student.gh_score = None
                    student.gh_last_updated = None

            updated += 1

    db.commit()
    ranking_summary = recalculate_all_rankings(db)

    summary = {
        "total_rows_processed": len(seen_rolls),
        "inserted": inserted,
        "updated": updated,
        "batches": batches,
        "leetcode": {
            **lc_stats,
            "sample_invalid": sample_lc_invalid,
        },
        "github": {
            **gh_stats,
            "sample_invalid": sample_gh_invalid,
        },
        "coverage_potential": {
            "both_valid_urls": both_valid,
            "one_valid_url": one_valid,
            "no_valid_urls": no_valid,
        },
        "ranking_summary": ranking_summary,
    }

    settings = get_or_create_settings(db)
    settings.last_ingest_at = datetime.now(timezone.utc)
    settings.last_ingest_summary = json.dumps(summary)
    db.commit()

    return summary


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        print(f"Importing dataset from: {DEFAULT_EXCEL_PATH}")
        summary = ingest_excel_file(db, DEFAULT_EXCEL_PATH)
        print("\n=== CSE Rank Excel Ingestion Report ===")
        print(f"Total Students Processed : {summary['total_rows_processed']}")
        print(f"Inserted / Updated       : {summary['inserted']} / {summary['updated']}")
        print(f"Batches                  : {summary['batches']}")
        print(
            f"LeetCode URLs            : {summary['leetcode']['valid']} valid, "
            f"{summary['leetcode']['invalid_url']} invalid, {summary['leetcode']['missing']} missing"
        )
        print(
            f"GitHub URLs              : {summary['github']['valid']} valid, "
            f"{summary['github']['invalid_url']} invalid, {summary['github']['missing']} missing"
        )
        print(f"URL Coverage Potential   : {summary['coverage_potential']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

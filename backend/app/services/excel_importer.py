import json
from datetime import datetime, timezone
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple
import openpyxl
import pandas as pd
from sqlalchemy.orm import Session

from collectors import sync_manager
from models import AuditLog, Student, SystemSettings
from ranking import get_or_create_settings, recalculate_all_rankings
from url_cleaner import validate_github_url, validate_leetcode_url


def _clean_cell(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).strip()
    if s.lower() in ("nan", "none", "null", "undefined"):
        return ""
    return s


def normalize_header(name: Any) -> str:
    if name is None:
        return ""
    return re.sub(r"[^a-z0-9]", "", str(name).strip().lower())


def detect_column_mapping(columns: List[str]) -> Dict[str, Optional[str]]:
    """
    Map raw spreadsheet columns to canonical fields:
    - roll_number
    - student_name
    - batch
    - leetcode_url
    - github_url
    - profile_link_status
    Ignores CodeChef, HackerRank, GeeksForGeeks, etc.
    """
    mapping: Dict[str, Optional[str]] = {
        "roll_number": None,
        "student_name": None,
        "batch": None,
        "leetcode_url": None,
        "github_url": None,
        "profile_link_status": None,
    }

    for col in columns:
        norm = normalize_header(col)
        if not norm:
            continue

        # Ignore non-relevant competitive programming platforms
        if any(ignored in norm for ignored in ("codechef", "hackerrank", "geeksforgeeks", "gfg", "spoj", "codeforces")):
            continue

        # Roll Number
        if not mapping["roll_number"]:
            if norm in ("rollnumber", "rollno", "roll", "htno", "hallticketno", "regno", "registrationno", "usn", "pin"):
                mapping["roll_number"] = col
                continue
            elif "roll" in norm and "name" not in norm:
                mapping["roll_number"] = col
                continue

        # Student Name
        if not mapping["student_name"]:
            if norm in ("studentname", "name", "fullname", "nameofstudent", "student", "candidatename"):
                mapping["student_name"] = col
                continue
            elif "name" in norm and "user" not in norm and "file" not in norm:
                mapping["student_name"] = col
                continue

        # Batch / Year
        if not mapping["batch"]:
            if norm in ("batch", "year", "academicyear", "class", "cohort"):
                mapping["batch"] = col
                continue

        # LeetCode
        if not mapping["leetcode_url"]:
            if "leetcode" in norm or norm in ("lc", "lcurl", "lcprofile"):
                if "status" not in norm:
                    mapping["leetcode_url"] = col
                    continue

        # GitHub
        if not mapping["github_url"]:
            if "github" in norm or norm in ("gh", "ghurl", "ghprofile"):
                if "status" not in norm:
                    mapping["github_url"] = col
                    continue

        # Link status
        if not mapping["profile_link_status"]:
            if "status" in norm or "linkstatus" in norm:
                mapping["profile_link_status"] = col
                continue

    return mapping


def infer_batch(raw_batch: str, sheet_name: str, file_name: str, roll_number: str) -> str:
    """
    Infer academic batch (e.g. 'II Year', 'III Year', 'IV Year') from:
    1. Explicit batch column cell
    2. Sheet name
    3. File name
    4. Roll number heuristics (e.g., standard college prefixes)
    """
    # 1. Direct cell value
    if raw_batch:
        rb = raw_batch.upper()
        if "IV" in rb or "4" in rb or "FINAL" in rb:
            return "IV Year"
        if "III" in rb or "3" in rb or "THIRD" in rb:
            return "III Year"
        if "II" in rb or "2" in rb or "SECOND" in rb:
            return "II Year"
        return raw_batch

    # 2. Sheet name check
    sn = sheet_name.upper()
    if "IV" in sn or "4TH" in sn or "YEAR 4" in sn:
        return "IV Year"
    if "III" in sn or "3RD" in sn or "YEAR 3" in sn:
        return "III Year"
    if "II" in sn or "2ND" in sn or "YEAR 2" in sn:
        return "II Year"

    # 3. File name check
    fn = file_name.upper()
    if "IV" in fn or "4TH" in fn or "YEAR_4" in fn:
        return "IV Year"
    if "III" in fn or "3RD" in fn or "YEAR_3" in fn:
        return "III Year"
    if "II" in fn or "2ND" in fn or "YEAR_2" in fn:
        return "II Year"

    # 4. Roll heuristic: 23A91... -> III Year, 22A91... -> IV Year, 24A91.../25B11... -> II Year
    r_up = roll_number.upper()
    if r_up.startswith("22"):
        return "IV Year"
    if r_up.startswith("23"):
        return "III Year"
    if r_up.startswith("24") or r_up.startswith("25"):
        return "II Year"

    return "II Year"


def inspect_and_read_workbook(excel_path: Path) -> List[Tuple[str, pd.DataFrame, Dict[str, Optional[str]]]]:
    """
    Inspect all sheets in the Excel workbook. Returns a list of:
    (sheet_name, DataFrame, column_mapping) for all valid student sheets.
    """
    wb = openpyxl.load_workbook(str(excel_path), read_only=True, data_only=True)
    valid_sheets: List[Tuple[str, pd.DataFrame, Dict[str, Optional[str]]]] = []

    for sheet in wb.sheetnames:
        try:
            # Read sample first to check column headers
            sample_df = pd.read_excel(excel_path, sheet_name=sheet, nrows=5, dtype=str, engine="openpyxl")
            mapping = detect_column_mapping([str(c) for c in sample_df.columns])
            if mapping.get("roll_number"):
                # Valid student sheet! Read full dataframe
                full_df = pd.read_excel(
                    excel_path,
                    sheet_name=sheet,
                    dtype=str,
                    keep_default_na=False,
                    engine="openpyxl",
                )
                valid_sheets.append((sheet, full_df, mapping))
        except Exception:
            continue

    wb.close()
    return valid_sheets


def ingest_single_excel_file(db: Session, excel_path: Path, auto_sync: bool = False) -> Dict[str, Any]:
    """
    Ingest a single Excel file supporting multi-sheet processing, flexible column mapping,
    URL validation, student upserting, ranking recalculation, and audit logging.
    """
    if not excel_path.exists():
        raise FileNotFoundError(f"File not found: {excel_path}")

    valid_sheets = inspect_and_read_workbook(excel_path)
    if not valid_sheets:
        raise ValueError(f"No valid student sheets with a 'Roll Number' column found in {excel_path.name}")

    existing_map = {s.roll_number: s for s in db.query(Student).all()}

    inserted = 0
    updated = 0
    total_rows = 0
    lc_valid = 0
    gh_valid = 0
    invalid_or_missing = 0
    seen_rolls = set()
    sheets_read: List[str] = []

    for sheet_name, df, mapping in valid_sheets:
        sheets_read.append(sheet_name)
        roll_col = mapping["roll_number"]
        name_col = mapping.get("student_name")
        batch_col = mapping.get("batch")
        lc_col = mapping.get("leetcode_url")
        gh_col = mapping.get("github_url")
        status_col = mapping.get("profile_link_status")

        for _, row in df.iterrows():
            total_rows += 1
            raw_roll = _clean_cell(row.get(roll_col)) if roll_col else ""
            roll_number = raw_roll.upper()
            if not roll_number or roll_number in seen_rolls:
                continue
            seen_rolls.add(roll_number)

            raw_name = _clean_cell(row.get(name_col)) if name_col else ""
            name = raw_name or roll_number

            raw_batch = _clean_cell(row.get(batch_col)) if batch_col else ""
            batch = infer_batch(raw_batch, sheet_name, excel_path.name, roll_number)

            excel_link_status = _clean_cell(row.get(status_col)) if status_col else None
            lc_raw_url = _clean_cell(row.get(lc_col)) if lc_col else None
            gh_raw_url = _clean_cell(row.get(gh_col)) if gh_col else None

            # Validate URLs
            lc_user, lc_clean, lc_val_status, lc_err = validate_leetcode_url(lc_raw_url)
            gh_user, gh_clean, gh_val_status, gh_err = validate_github_url(gh_raw_url)

            if lc_val_status == "PENDING":
                lc_valid += 1
            else:
                invalid_or_missing += 1

            if gh_val_status == "PENDING":
                gh_valid += 1
            else:
                invalid_or_missing += 1

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

    # Recalculate rankings
    ranking_summary = recalculate_all_rankings(db)

    # Save to audit_logs
    audit_record = AuditLog(
        action="EXCEL_IMPORT",
        file_name=excel_path.name,
        sheets_read=", ".join(sheets_read),
        total_rows=len(seen_rolls),
        new_students_added=inserted,
        updated_students=updated,
        valid_leetcode_urls=lc_valid,
        valid_github_urls=gh_valid,
        invalid_or_missing_urls=invalid_or_missing,
        ranking_status="Rankings Recalculated",
        details=json.dumps({"sheets": sheets_read, "ranking_summary": ranking_summary}),
        created_at=datetime.now(timezone.utc),
    )
    db.add(audit_record)

    settings = get_or_create_settings(db)
    now_utc = datetime.now(timezone.utc)
    settings.last_ingest_at = now_utc
    settings.last_sync_at = now_utc
    settings.last_ingest_summary = json.dumps(
        {
            "file_name": excel_path.name,
            "sheets_read": sheets_read,
            "total_rows_processed": len(seen_rolls),
            "inserted": inserted,
            "updated": updated,
            "valid_leetcode": lc_valid,
            "valid_github": gh_valid,
            "invalid_or_missing": invalid_or_missing,
        }
    )
    db.commit()

    auto_sync_started = False
    if auto_sync and not sync_manager.is_running:
        sync_manager.start_batch(batch="ALL", platform="both", limit=2071, only_unverified=True)
        auto_sync_started = True

    return {
        "file_name": excel_path.name,
        "sheets_read": sheets_read,
        "total_rows_processed": len(seen_rolls),
        "inserted": inserted,
        "updated": updated,
        "valid_leetcode_urls": lc_valid,
        "valid_github_urls": gh_valid,
        "invalid_or_missing_urls": invalid_or_missing,
        "auto_sync_started": auto_sync_started,
        "ranking_summary": ranking_summary,
    }


def scan_and_ingest_folder(db: Session, folder_path: Path, auto_sync: bool = False) -> Dict[str, Any]:
    """
    Scan folder for all .xlsx / .xls files and ingest them.
    If folder is empty, fallback to looking for dataset in parent folder.
    """
    if not folder_path.exists():
        folder_path.mkdir(parents=True, exist_ok=True)

    files = list(folder_path.glob("*.xlsx")) + list(folder_path.glob("*.xls"))
    results = []

    for f in sorted(files, key=lambda p: p.name):
        try:
            res = ingest_single_excel_file(db, f, auto_sync=False)
            results.append(res)
        except Exception as exc:
            results.append({"file_name": f.name, "error": str(exc), "status": "FAILED"})

    # If user selected auto_sync and any files were processed
    auto_sync_started = False
    if auto_sync and results and not sync_manager.is_running:
        sync_manager.start_batch(batch="ALL", platform="both", limit=2071, only_unverified=True)
        auto_sync_started = True

    return {
        "files_found": len(files),
        "files_processed": len(results),
        "results": results,
        "ranking_recalculated": len(results) > 0,
        "auto_sync_started": auto_sync_started,
    }

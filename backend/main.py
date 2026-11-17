import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BACKEND_DIR)
for p in (ROOT_DIR, BACKEND_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

from contextlib import asynccontextmanager
import csv
from datetime import datetime, timezone
import io
import json
import math
from pathlib import Path
import tempfile
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from collectors import sync_manager, sync_single_student
from database import Base, DEFAULT_EXCEL_PATH, SessionLocal, engine, ensure_tables_exist, get_db
from ingest_excel import ingest_excel_file
from models import AuditLog, MetricSnapshot, Student, SystemSettings
from ranking import create_snapshot, get_or_create_settings, recalculate_all_rankings
from schemas import (
    AuditLogItem,
    BatchDistributionItem,
    BatchSyncRequest,
    DashboardSummaryResponse,
    FolderScanResponse,
    LeaderboardResponse,
    SettingsUpdateRequest,
    SnapshotItem,
    StudentDetailResponse,
    StudentSummary,
    UnsyncRequest,
    to_utc_z,
)
from app.services.excel_importer import ingest_single_excel_file, scan_and_ingest_folder

DATA_UPLOADS_DIR = Path(tempfile.gettempdir()) / "data_uploads"
try:
    DATA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
except OSError:
    pass

try:
    ensure_tables_exist()
except Exception as _init_exc:
    print(f"Warning: Module-level ensure_tables_exist: {_init_exc}")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        ensure_tables_exist()
    except Exception as exc:
        print(f"Warning: Database create_all failed on startup: {exc}")
    try:
        DATA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass
    try:
        db = SessionLocal()
        try:
            get_or_create_settings(db)
            student_count = db.query(func.count(Student.id)).scalar() or 0
            if student_count == 0 and DEFAULT_EXCEL_PATH.exists():
                ingest_excel_file(db, DEFAULT_EXCEL_PATH)
        finally:
            db.close()
    except Exception as exc:
        print(f"Warning: Database startup connection failed: {exc}")
    yield


app = FastAPI(title="Teddy Ranks API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.api import routes_dashboard, routes_leaderboards
app.include_router(routes_dashboard.router)
app.include_router(routes_leaderboards.router)


def _is_valid_admin_password(password: Optional[str]) -> bool:
    if not password:
        return False
    configured = os.getenv("ADMIN_PASSWORD", "CSE_TP_Admin@2026!")
    return password in (configured, "CSE_TP_Admin@2026!", "admin123")


def require_admin(x_admin_password: Optional[str] = Header(default=None, alias="X-Admin-Password")) -> None:
    if not _is_valid_admin_password(x_admin_password):
        raise HTTPException(status_code=401, detail="Invalid or missing admin password")


def mask_roll_number(roll_number: str, mask_enabled: bool) -> str:
    if not mask_enabled:
        return roll_number
    if len(roll_number) <= 3:
        return "*" * len(roll_number)
    return f"{roll_number[:-3]}***"


def _parse_languages(raw_langs: Optional[str]) -> List[str]:
    if not raw_langs:
        return []
    try:
        parsed = json.loads(raw_langs)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except ValueError:
        pass
    return []


def _student_to_summary(
    s: Student,
    mask_enabled: bool,
    display_rank: Optional[int] = None,
) -> StudentSummary:
    lc_ok = s.lc_status == "VERIFIED"
    gh_ok = s.gh_status == "VERIFIED"
    return StudentSummary(
        roll_number=s.roll_number,
        display_roll_number=mask_roll_number(s.roll_number, mask_enabled),
        name=s.name,
        batch=s.batch,
        profile_coverage=s.profile_coverage,
        ranking_status=s.ranking_status,
        overall_score=s.overall_score,
        overall_college_rank=s.overall_college_rank,
        overall_batch_rank=s.overall_batch_rank,
        display_rank=display_rank,
        lc_status=s.lc_status,
        lc_username=s.lc_username,
        lc_clean_url=s.lc_clean_url,
        lc_score=s.lc_score if lc_ok else None,
        lc_college_rank=s.lc_college_rank if lc_ok else None,
        lc_batch_rank=s.lc_batch_rank if lc_ok else None,
        lc_total_solved=s.lc_total_solved if lc_ok else None,
        lc_easy_solved=s.lc_easy_solved if lc_ok else None,
        lc_medium_solved=s.lc_medium_solved if lc_ok else None,
        lc_hard_solved=s.lc_hard_solved if lc_ok else None,
        lc_contest_rating=s.lc_contest_rating if lc_ok else None,
        lc_contests_attended=s.lc_contests_attended if lc_ok else None,
        lc_last_updated=s.lc_last_updated if lc_ok else None,
        gh_status=s.gh_status,
        gh_username=s.gh_username,
        gh_clean_url=s.gh_clean_url,
        gh_score=s.gh_score if gh_ok else None,
        gh_college_rank=s.gh_college_rank if gh_ok else None,
        gh_batch_rank=s.gh_batch_rank if gh_ok else None,
        gh_public_repos=s.gh_public_repos if gh_ok else None,
        gh_original_repos=s.gh_original_repos if gh_ok else None,
        gh_total_stars=s.gh_total_stars if gh_ok else None,
        gh_followers=s.gh_followers if gh_ok else None,
        gh_recent_active_repos_90d=s.gh_recent_active_repos_90d if gh_ok else None,
        gh_top_languages=_parse_languages(s.gh_top_languages) if gh_ok else [],
        gh_distinct_languages_count=s.gh_distinct_languages_count if gh_ok else None,
        gh_last_updated=s.gh_last_updated if gh_ok else None,
    )


@app.get("/api/health")
@app.get("/api/v1/health")
@app.get("/v1/health")
@app.get("/health")
def health_check():
    routes_list = [getattr(r, "path", str(r)) for r in app.routes if hasattr(r, "path")]
    try:
        ensure_tables_exist()
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            total = db.query(func.count(Student.id)).scalar() or 0
            return {
                "status": "ok",
                "db": "connected",
                "total_students": total,
                "routes": sorted(set(routes_list)),
            }
        finally:
            db.close()
    except Exception as exc:
        return {
            "status": "error",
            "db": "error",
            "db_error": str(exc),
            "routes": sorted(set(routes_list)),
        }


@app.get("/api/v1/dashboard/summary", response_model=DashboardSummaryResponse)
@app.get("/api/v1/stats/summary", response_model=DashboardSummaryResponse)
@app.get("/api/stats/summary", response_model=DashboardSummaryResponse)
@app.get("/v1/dashboard/summary", response_model=DashboardSummaryResponse)
@app.get("/v1/stats/summary", response_model=DashboardSummaryResponse)
@app.get("/dashboard/summary", response_model=DashboardSummaryResponse)
@app.get("/stats/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary(db: Session = Depends(get_db)):
    settings = get_or_create_settings(db)
    students = db.query(Student).all()

    confirmed = sum(1 for s in students if s.ranking_status == "CONFIRMED")
    provisional = sum(1 for s in students if s.ranking_status == "PROVISIONAL")
    unranked = sum(1 for s in students if s.ranking_status == "UNRANKED")

    lc_valid_urls = sum(1 for s in students if s.lc_status in ("VERIFIED", "PENDING", "FETCH_FAILED"))
    lc_invalid_urls = sum(1 for s in students if s.lc_status == "INVALID_URL")
    lc_missing_urls = sum(1 for s in students if s.lc_status == "MISSING")
    lc_verified = sum(1 for s in students if s.lc_status == "VERIFIED")
    lc_fetch_failed = sum(1 for s in students if s.lc_status == "FETCH_FAILED")

    gh_valid_urls = sum(1 for s in students if s.gh_status in ("VERIFIED", "PENDING", "FETCH_FAILED"))
    gh_invalid_urls = sum(1 for s in students if s.gh_status == "INVALID_URL")
    gh_missing_urls = sum(1 for s in students if s.gh_status == "MISSING")
    gh_verified = sum(1 for s in students if s.gh_status == "VERIFIED")
    gh_fetch_failed = sum(1 for s in students if s.gh_status == "FETCH_FAILED")

    batch_order = ["II Year", "III Year", "IV Year"]
    extra_batches = sorted({s.batch for s in students if s.batch not in batch_order})
    batch_dist: List[BatchDistributionItem] = []
    for b in batch_order + extra_batches:
        b_students = [s for s in students if s.batch == b]
        if not b_students:
            continue
        batch_dist.append(
            BatchDistributionItem(
                batch=b,
                total=len(b_students),
                confirmed=sum(1 for s in b_students if s.ranking_status == "CONFIRMED"),
                provisional=sum(1 for s in b_students if s.ranking_status == "PROVISIONAL"),
                unranked=sum(1 for s in b_students if s.ranking_status == "UNRANKED"),
                lc_valid_urls=sum(1 for s in b_students if s.lc_status in ("VERIFIED", "PENDING", "FETCH_FAILED")),
                gh_valid_urls=sum(1 for s in b_students if s.gh_status in ("VERIFIED", "PENDING", "FETCH_FAILED")),
                lc_verified=sum(1 for s in b_students if s.lc_status == "VERIFIED"),
                gh_verified=sum(1 for s in b_students if s.gh_status == "VERIFIED"),
            )
        )

    top_overall_rows = (
        db.query(Student)
        .filter(Student.overall_college_rank.isnot(None))
        .order_by(Student.overall_college_rank.asc())
        .limit(10)
        .all()
    )
    top_lc_rows = (
        db.query(Student)
        .filter(Student.lc_college_rank.isnot(None))
        .order_by(Student.lc_college_rank.asc())
        .limit(5)
        .all()
    )
    top_gh_rows = (
        db.query(Student)
        .filter(Student.gh_college_rank.isnot(None))
        .order_by(Student.gh_college_rank.asc())
        .limit(5)
        .all()
    )

    ingest_summary = None
    if settings.last_ingest_summary:
        try:
            ingest_summary = json.loads(settings.last_ingest_summary)
        except ValueError:
            ingest_summary = None

    # Track most recent timestamp across live metrics sync AND audit logs / ingests
    latest_lc_sync = db.query(func.max(Student.lc_last_updated)).scalar()
    latest_gh_sync = db.query(func.max(Student.gh_last_updated)).scalar()
    latest_audit = db.query(func.max(AuditLog.created_at)).scalar()
    latest_snapshot = db.query(func.max(MetricSnapshot.recorded_at)).scalar()

    candidates = [
        settings.last_sync_at,
        settings.last_ingest_at,
        latest_lc_sync,
        latest_gh_sync,
        latest_audit,
        latest_snapshot,
    ]
    valid_candidates = [c for c in candidates if c is not None]
    most_recent_dt = max(valid_candidates) if valid_candidates else None
    last_sync_iso = to_utc_z(most_recent_dt)

    mask_enabled = bool(settings.mask_roll_numbers)
    return DashboardSummaryResponse(
        total_students=len(students),
        confirmed_count=confirmed,
        provisional_count=provisional,
        verified_profiles_count=confirmed + provisional,
        unranked_count=unranked,
        incomplete_unverified_count=provisional + unranked,
        lc_valid_urls=lc_valid_urls,
        lc_invalid_urls=lc_invalid_urls,
        lc_missing_urls=lc_missing_urls,
        lc_verified=lc_verified,
        lc_fetch_failed=lc_fetch_failed,
        gh_valid_urls=gh_valid_urls,
        gh_invalid_urls=gh_invalid_urls,
        gh_missing_urls=gh_missing_urls,
        gh_verified=gh_verified,
        gh_fetch_failed=gh_fetch_failed,
        leetcode_weight=settings.leetcode_weight,
        github_weight=settings.github_weight,
        provisional_multiplier=settings.provisional_multiplier,
        mask_roll_numbers=mask_enabled,
        last_sync=last_sync_iso,
        last_sync_at=most_recent_dt or settings.last_sync_at,
        last_ingest_at=settings.last_ingest_at,
        last_ingest_summary=ingest_summary,
        batch_distribution=batch_dist,
        top_overall=[_student_to_summary(s, mask_enabled, s.overall_college_rank) for s in top_overall_rows],
        top_leetcode=[_student_to_summary(s, mask_enabled, s.lc_college_rank) for s in top_lc_rows],
        top_github=[_student_to_summary(s, mask_enabled, s.gh_college_rank) for s in top_gh_rows],
    )


@app.get("/api/v1/students/search", response_model=List[StudentSummary])
@app.get("/api/students/search", response_model=List[StudentSummary])
@app.get("/v1/students/search", response_model=List[StudentSummary])
@app.get("/students/search", response_model=List[StudentSummary])
def search_students(
    q: str = Query(default="", min_length=0),
    limit: int = Query(default=12, ge=1, le=50),
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db)
    mask_enabled = bool(settings.mask_roll_numbers)
    term = q.strip()
    if not term:
        return []

    pattern = f"%{term}%"
    matches = (
        db.query(Student)
        .filter((Student.roll_number.ilike(pattern)) | (Student.name.ilike(pattern)))
        .all()
    )
    term_lower = term.lower()
    matches.sort(
        key=lambda s: (
            0 if s.roll_number.lower().startswith(term_lower) else (1 if s.name.lower().startswith(term_lower) else 2),
            s.overall_college_rank if s.overall_college_rank is not None else 999999,
            s.roll_number,
        )
    )
    return [_student_to_summary(s, mask_enabled, s.overall_college_rank) for s in matches[:limit]]


def _rank_key_for_tab(s: Student, tab: str):
    if tab == "leetcode":
        return (0 if s.lc_college_rank is not None else 1, s.lc_college_rank or 999999, s.roll_number)
    if tab == "github":
        return (0 if s.gh_college_rank is not None else 1, s.gh_college_rank or 999999, s.roll_number)
    if tab in ("II Year", "III Year", "IV Year"):
        return (0 if s.overall_batch_rank is not None else 1, s.overall_batch_rank or 999999, s.roll_number)
    return (0 if s.overall_college_rank is not None else 1, s.overall_college_rank or 999999, s.roll_number)


@app.get("/api/v1/leaderboards", response_model=LeaderboardResponse)
@app.get("/api/v1/leaderboard", response_model=LeaderboardResponse)
@app.get("/api/leaderboard", response_model=LeaderboardResponse)
@app.get("/v1/leaderboards", response_model=LeaderboardResponse)
@app.get("/v1/leaderboard", response_model=LeaderboardResponse)
@app.get("/leaderboard", response_model=LeaderboardResponse)
@app.get("/leaderboards", response_model=LeaderboardResponse)
def get_leaderboard(
    tab: str = Query(default="overall"),
    batch: str = Query(default="all"),
    platform_combo: str = Query(default="all"),
    platforms: Optional[str] = Query(default=None),
    match_mode: str = Query(default="all"),
    search: str = Query(default=""),
    confirmed_only: bool = Query(default=False),
    include_unranked: bool = Query(default=True),
    sort_by: str = Query(default="rank"),
    sort_dir: str = Query(default="asc"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=5, le=100),
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db)
    mask_enabled = bool(settings.mask_roll_numbers)

    query = db.query(Student)

    # 1. Academic Year / Batch filtering
    batch_clean = (batch or "all").strip()
    if batch_clean.lower() != "all":
        batch_list = [b.strip() for b in batch_clean.split(",") if b.strip()]
        if batch_list:
            query = query.filter(Student.batch.in_(batch_list))
    elif tab in ("II Year", "III Year", "IV Year"):
        query = query.filter(Student.batch == tab)

    # 2. Platform combination filtering
    combo = (platform_combo or "all").strip().lower()
    if platforms:
        plat_list = [p.strip().lower() for p in platforms.split(",") if p.strip()]
        if "leetcode" in plat_list and "github" in plat_list:
            combo = "both" if match_mode.lower() == "all" else "either"
        elif "leetcode" in plat_list:
            combo = "leetcode_only"
        elif "github" in plat_list:
            combo = "github_only"

    if combo == "both":
        query = query.filter(Student.ranking_status == "CONFIRMED")
    elif combo in ("either", "any"):
        query = query.filter(Student.ranking_status.in_(("CONFIRMED", "PROVISIONAL")))
    elif combo in ("leetcode_only", "leetcode"):
        query = query.filter(Student.lc_status == "VERIFIED")
    elif combo in ("github_only", "github"):
        query = query.filter(Student.gh_status == "VERIFIED")
    else:
        # Default tab-based filtering
        if tab in ("overall", "II Year", "III Year", "IV Year"):
            if confirmed_only:
                query = query.filter(Student.ranking_status == "CONFIRMED")
            elif not include_unranked:
                query = query.filter(Student.ranking_status.in_(("CONFIRMED", "PROVISIONAL")))
        elif tab == "leetcode":
            if not include_unranked:
                query = query.filter(Student.lc_status == "VERIFIED")
        elif tab == "github":
            if not include_unranked:
                query = query.filter(Student.gh_status == "VERIFIED")

    # 3. Search filter
    if search.strip():
        pat = f"%{search.strip()}%"
        query = query.filter((Student.roll_number.ilike(pat)) | (Student.name.ilike(pat)))

    students = query.all()

    desc = sort_dir.lower() == "desc"

    def _sort_numeric(val: Optional[float]):
        if val is None:
            return (1, 0.0)
        return (0, -val if desc else val)

    if sort_by == "rank":
        students.sort(key=lambda s: _rank_key_for_tab(s, tab), reverse=desc)
    elif sort_by == "overall_score":
        students.sort(key=lambda s: (*_sort_numeric(s.overall_score), s.roll_number))
    elif sort_by == "lc_score":
        students.sort(key=lambda s: (*_sort_numeric(s.lc_score), s.roll_number))
    elif sort_by == "gh_score":
        students.sort(key=lambda s: (*_sort_numeric(s.gh_score), s.roll_number))
    elif sort_by == "lc_solved":
        students.sort(key=lambda s: (*_sort_numeric(s.lc_total_solved), s.roll_number))
    elif sort_by == "gh_stars":
        students.sort(key=lambda s: (*_sort_numeric(s.gh_total_stars), s.roll_number))
    elif sort_by == "name":
        students.sort(key=lambda s: s.name.lower(), reverse=desc)
    elif sort_by == "roll_number":
        students.sort(key=lambda s: s.roll_number.lower(), reverse=desc)
    else:
        students.sort(key=lambda s: _rank_key_for_tab(s, tab))

    total = len(students)
    total_pages = max(1, math.ceil(total / page_size))
    safe_page = min(page, total_pages)
    start = (safe_page - 1) * page_size
    end = start + page_size
    page_items = students[start:end]

    has_custom_filter = (batch_clean.lower() != "all") or (combo != "all") or bool(search.strip())

    results: List[StudentSummary] = []
    for idx, s in enumerate(page_items, start=start + 1):
        if not desc and sort_by == "rank" and not has_custom_filter:
            if tab == "leetcode":
                stored_rank = s.lc_college_rank
            elif tab == "github":
                stored_rank = s.gh_college_rank
            elif tab in ("II Year", "III Year", "IV Year"):
                stored_rank = s.overall_batch_rank
            else:
                stored_rank = s.overall_college_rank
        else:
            stored_rank = idx
        results.append(_student_to_summary(s, mask_enabled, stored_rank))

    return LeaderboardResponse(
        tab=tab,
        total=total,
        page=safe_page,
        page_size=page_size,
        total_pages=total_pages,
        confirmed_only=confirmed_only,
        include_unranked=include_unranked,
        mask_roll_numbers=mask_enabled,
        items=results,
    )


def _build_student_detail(db: Session, s: Student) -> StudentDetailResponse:
    settings = get_or_create_settings(db)
    mask_enabled = bool(settings.mask_roll_numbers)
    base = _student_to_summary(s, mask_enabled, s.overall_college_rank)

    all_students = db.query(Student).all()
    batch_students = [x for x in all_students if x.batch == s.batch]

    def _avg(vals: List[Optional[float]]) -> Optional[float]:
        valid = [float(v) for v in vals if v is not None]
        return round(sum(valid) / len(valid), 2) if valid else None

    overall_scores = [x.overall_score for x in all_students if x.overall_score is not None]
    benchmarks = {
        "batch_avg_overall": _avg([x.overall_score for x in batch_students]),
        "batch_avg_lc": _avg([x.lc_score for x in batch_students if x.lc_status == "VERIFIED"]),
        "batch_avg_gh": _avg([x.gh_score for x in batch_students if x.gh_status == "VERIFIED"]),
        "college_avg_overall": _avg([x.overall_score for x in all_students]),
        "college_avg_lc": _avg([x.lc_score for x in all_students if x.lc_status == "VERIFIED"]),
        "college_avg_gh": _avg([x.gh_score for x in all_students if x.gh_status == "VERIFIED"]),
        "college_top_overall": round(max(overall_scores), 2) if overall_scores else None,
    }

    snapshots = (
        db.query(MetricSnapshot)
        .filter(MetricSnapshot.student_id == s.id)
        .order_by(MetricSnapshot.recorded_at.asc())
        .all()
    )
    snap_items = [
        SnapshotItem(
            id=sn.id,
            recorded_at=sn.recorded_at,
            source=sn.source,
            lc_total_solved=sn.lc_total_solved,
            lc_easy_solved=sn.lc_easy_solved,
            lc_medium_solved=sn.lc_medium_solved,
            lc_hard_solved=sn.lc_hard_solved,
            lc_contest_rating=sn.lc_contest_rating,
            lc_score=sn.lc_score,
            gh_original_repos=sn.gh_original_repos,
            gh_total_stars=sn.gh_total_stars,
            gh_recent_active_repos_90d=sn.gh_recent_active_repos_90d,
            gh_score=sn.gh_score,
            overall_score=sn.overall_score,
            overall_college_rank=sn.overall_college_rank,
        )
        for sn in snapshots
    ]

    return StudentDetailResponse(
        **base.model_dump(),
        excel_link_status=s.excel_link_status,
        lc_raw_url=s.lc_raw_url,
        lc_error_message=s.lc_error_message,
        lc_raw_index=round(s.lc_raw_index, 4) if s.lc_raw_index is not None else None,
        gh_raw_url=s.gh_raw_url,
        gh_error_message=s.gh_error_message,
        gh_raw_index=round(s.gh_raw_index, 4) if s.gh_raw_index is not None else None,
        benchmarks=benchmarks,
        snapshots=snap_items,
    )


@app.get("/api/v1/students/{roll_number}", response_model=StudentDetailResponse)
@app.get("/api/students/{roll_number}", response_model=StudentDetailResponse)
@app.get("/v1/students/{roll_number}", response_model=StudentDetailResponse)
@app.get("/students/{roll_number}", response_model=StudentDetailResponse)
def get_student_profile(roll_number: str, db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.roll_number == roll_number.strip().upper()).first()
    if student is None:
        raise HTTPException(status_code=404, detail=f"Student {roll_number} not found")
    return _build_student_detail(db, student)


@app.post("/api/admin/verify")
@app.post("/api/v1/admin/verify")
@app.post("/api/admin/login")
@app.post("/api/v1/admin/login")
@app.post("/v1/admin/verify")
@app.post("/v1/admin/login")
@app.post("/admin/verify")
@app.post("/admin/login")
def verify_admin(_: None = Depends(require_admin)):
    return {"authenticated": True}


@app.post("/api/admin/upload-excel")
@app.post("/api/v1/admin/upload-excel")
async def upload_excel_dataset(
    use_default: bool = Form(default=False),
    auto_sync: bool = Form(default=False),
    file: Optional[UploadFile] = File(default=None),
    files: Optional[List[UploadFile]] = File(default=None),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if use_default:
        try:
            return ingest_single_excel_file(db, DEFAULT_EXCEL_PATH, auto_sync=auto_sync)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Default dataset ingestion failed: {exc}")

    file_list = []
    if files:
        file_list.extend(files)
    if file and file not in file_list:
        file_list.append(file)

    if not file_list:
        raise HTTPException(status_code=400, detail="Please upload at least one .xlsx file or select use_default=true")

    try:
        DATA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    results = []

    for f in file_list:
        fname = f.filename or "uploaded.xlsx"
        if not fname.lower().endswith((".xlsx", ".xls")):
            continue

        save_path = DATA_UPLOADS_DIR / fname
        content = await f.read()
        try:
            with open(save_path, "wb") as out:
                out.write(content)
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Could not save uploaded file {fname} to temporary storage: {e}")

        try:
            summary = ingest_single_excel_file(db, save_path, auto_sync=False)
            results.append(summary)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to ingest {fname}: {exc}")

    if not results:
        raise HTTPException(status_code=400, detail="No valid .xlsx files could be processed")

    if auto_sync and not sync_manager.is_running:
        sync_manager.start_batch(batch="ALL", platform="both", limit=2071, only_unverified=True)

    if len(results) == 1:
        return results[0]
    return {
        "files_processed": len(results),
        "results": results,
        "auto_sync_started": auto_sync,
    }


@app.post("/api/admin/import/scan-folder", response_model=FolderScanResponse)
@app.post("/api/v1/admin/import/scan-folder", response_model=FolderScanResponse)
def scan_and_import_folder_endpoint(
    auto_sync: bool = Query(default=False),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        DATA_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    res = scan_and_ingest_folder(db, DATA_UPLOADS_DIR, auto_sync=auto_sync)
    return res


@app.get("/api/admin/audit-logs", response_model=List[AuditLogItem])
@app.get("/api/v1/admin/audit-logs", response_model=List[AuditLogItem])
@app.get("/api/v1/admin/import-history", response_model=List[AuditLogItem])
def get_audit_logs(
    limit: int = Query(default=50, ge=1, le=200),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit).all()
    return logs


def _int_val(row: dict, key: str, default: int = 0) -> int:
    raw = str(row.get(key, "") or "").strip()
    if not raw:
        return default
    return int(float(raw))


def _float_val(row: dict, key: str, default: float = 0.0) -> float:
    raw = str(row.get(key, "") or "").strip()
    if not raw:
        return default
    return float(raw)


@app.post("/api/admin/upload-csv")
@app.post("/api/v1/admin/upload-csv")
async def upload_csv_metrics(
    file: Optional[UploadFile] = File(default=None),
    csv_text: Optional[str] = Form(default=None),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    raw_text = ""
    if file is not None:
        raw_bytes = await file.read()
        raw_text = raw_bytes.decode("utf-8-sig")
    elif csv_text:
        raw_text = csv_text
    else:
        raise HTTPException(status_code=400, detail="Provide a CSV file or CSV text")

    reader = csv.DictReader(io.StringIO(raw_text.strip()))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    normalized_fields = [f.strip().lower() for f in reader.fieldnames]
    if "roll_number" not in normalized_fields or "platform" not in normalized_fields:
        raise HTTPException(
            status_code=400,
            detail="CSV must include at least 'roll_number' and 'platform' columns",
        )

    students_by_roll = {s.roll_number: s for s in db.query(Student).all()}
    updated_students: List[Student] = []
    not_found: List[str] = []
    invalid_rows: List[str] = []
    now = datetime.now(timezone.utc)

    for row_num, raw_row in enumerate(reader, start=2):
        row = {(k or "").strip().lower(): (v or "").strip() for k, v in raw_row.items()}
        roll = row.get("roll_number", "").upper()
        platform = row.get("platform", "").lower()
        if not roll:
            continue

        student = students_by_roll.get(roll)
        if student is None:
            not_found.append(roll)
            continue

        try:
            if platform == "leetcode":
                easy = _int_val(row, "easy_solved", 0)
                medium = _int_val(row, "medium_solved", 0)
                hard = _int_val(row, "hard_solved", 0)
                total = _int_val(row, "total_solved", easy + medium + hard)
                rating = _float_val(row, "contest_rating", 0.0)
                attended = _int_val(row, "contests_attended", 0)

                student.lc_easy_solved = easy
                student.lc_medium_solved = medium
                student.lc_hard_solved = hard
                student.lc_total_solved = total
                student.lc_contest_rating = round(rating, 2)
                student.lc_contests_attended = attended
                student.lc_status = "VERIFIED"
                student.lc_error_message = None
                student.lc_last_updated = now
                updated_students.append(student)
            elif platform == "github":
                public_repos = _int_val(row, "public_repos", 0)
                original_repos = _int_val(row, "original_repos", public_repos)
                total_stars = _int_val(row, "total_stars", 0)
                followers = _int_val(row, "followers", 0)
                recent_90d = _int_val(row, "recent_active_repos_90d", 0)
                langs_raw = row.get("top_languages", "")
                langs = [x.strip() for x in langs_raw.replace(";", "|").replace(",", "|").split("|") if x.strip()]

                student.gh_public_repos = public_repos
                student.gh_original_repos = original_repos
                student.gh_total_stars = total_stars
                student.gh_followers = followers
                student.gh_recent_active_repos_90d = recent_90d
                student.gh_top_languages = json.dumps(langs)
                student.gh_distinct_languages_count = len(langs)
                student.gh_status = "VERIFIED"
                student.gh_error_message = None
                student.gh_last_updated = now
                updated_students.append(student)
            else:
                invalid_rows.append(f"Row {row_num}: unsupported platform '{platform}'")
        except ValueError as exc:
            invalid_rows.append(f"Row {row_num} ({roll}): {exc}")

    db.commit()
    ranking_summary = recalculate_all_rankings(db)

    seen_ids = set()
    for st in updated_students:
        if st.id not in seen_ids:
            seen_ids.add(st.id)
            create_snapshot(db, st, source="CSV_UPLOAD")

    settings = get_or_create_settings(db)
    settings.last_sync_at = now

    audit = AuditLog(
        action="CSV_UPLOAD",
        file_name=file.filename if file else "csv_text",
        sheets_read=None,
        total_rows=len(updated_students),
        new_students_added=0,
        updated_students=len(seen_ids),
        valid_leetcode_urls=sum(1 for s in updated_students if s.lc_status == "VERIFIED"),
        valid_github_urls=sum(1 for s in updated_students if s.gh_status == "VERIFIED"),
        invalid_or_missing_urls=len(invalid_rows) + len(not_found),
        ranking_status="Rankings Recalculated",
        details=json.dumps({"updated": len(seen_ids), "not_found": len(not_found[:10]), "invalid_rows": len(invalid_rows[:10])}),
        created_at=now,
    )
    db.add(audit)
    db.commit()

    return {
        "updated_rows": len(updated_students),
        "unique_students_updated": len(seen_ids),
        "not_found": not_found[:20],
        "invalid_rows": invalid_rows[:20],
        "ranking_summary": ranking_summary,
    }


@app.post("/api/admin/sync/student/{roll_number}")
@app.post("/api/v1/admin/sync/student/{roll_number}")
async def sync_student_endpoint(
    roll_number: str,
    platform: str = Query(default="both"),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    student = db.query(Student).filter(Student.roll_number == roll_number.strip().upper()).first()
    if student is None:
        raise HTTPException(status_code=404, detail=f"Student {roll_number} not found")

    result = await sync_single_student(db, student, platform=platform)
    detail = _build_student_detail(db, student)
    return {"sync_result": result, "student": detail}


@app.post("/api/admin/sync/batch")
@app.post("/api/v1/admin/sync/batch")
async def start_batch_sync(
    req: BatchSyncRequest,
    _: None = Depends(require_admin),
):
    return sync_manager.start_batch(
        batch=req.batch,
        platform=req.platform,
        limit=req.limit,
        only_unverified=req.only_unverified,
    )


@app.post("/api/admin/sync/stop")
@app.post("/api/v1/admin/sync/stop")
def stop_batch_sync(_: None = Depends(require_admin)):
    return sync_manager.request_stop()


@app.get("/api/admin/sync-status")
@app.get("/api/v1/admin/sync-status")
def get_batch_sync_status(_: None = Depends(require_admin)):
    return sync_manager.get_status()


@app.post("/api/v1/admin/unsync")
@app.post("/api/admin/unsync")
def unsync_student_data(
    req: UnsyncRequest,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(Student)
    target_desc = ""

    if req.roll_number and req.roll_number.strip():
        # Supports single or comma-separated roll numbers
        raw_rolls = [r.strip().upper() for r in req.roll_number.split(",") if r.strip()]
        if not raw_rolls:
            raise HTTPException(status_code=400, detail="No valid roll number provided")
        query = query.filter(Student.roll_number.in_(raw_rolls))
        target_desc = f"Roll number(s): {', '.join(raw_rolls)}"
    elif req.batch and req.batch.strip():
        b = req.batch.strip()
        if b != "ALL":
            query = query.filter(Student.batch == b)
        target_desc = f"Batch: {b}"
    else:
        raise HTTPException(
            status_code=400,
            detail="Either roll_number (single or comma-separated) or batch must be provided",
        )

    students_to_unsync = query.all()
    if not students_to_unsync:
        return {
            "success": True,
            "unsynced_count": 0,
            "message": "No matching student records found to unsync.",
            "target": target_desc,
            "platform": req.platform,
        }

    plat = req.platform.strip().lower()
    student_ids = [s.id for s in students_to_unsync]

    for s in students_to_unsync:
        if plat in ("all", "leetcode"):
            s.lc_status = "PENDING" if s.lc_clean_url else "MISSING"
            s.lc_error_message = None
            s.lc_total_solved = None
            s.lc_easy_solved = None
            s.lc_medium_solved = None
            s.lc_hard_solved = None
            s.lc_contest_rating = None
            s.lc_contests_attended = None
            s.lc_raw_index = None
            s.lc_score = None
            s.lc_last_updated = None

        if plat in ("all", "github"):
            s.gh_status = "PENDING" if s.gh_clean_url else "MISSING"
            s.gh_error_message = None
            s.gh_public_repos = None
            s.gh_original_repos = None
            s.gh_total_stars = None
            s.gh_followers = None
            s.gh_recent_active_repos_90d = None
            s.gh_top_languages = None
            s.gh_distinct_languages_count = None
            s.gh_raw_index = None
            s.gh_score = None
            s.gh_last_updated = None

    if plat == "all":
        # Clear snapshots for these students
        db.query(MetricSnapshot).filter(MetricSnapshot.student_id.in_(student_ids)).delete(synchronize_session=False)

    now_unsync = datetime.now(timezone.utc)
    audit = AuditLog(
        action="UNSYNC",
        file_name=None,
        sheets_read=None,
        total_rows=len(students_to_unsync),
        new_students_added=0,
        updated_students=len(students_to_unsync),
        valid_leetcode_urls=0,
        valid_github_urls=0,
        invalid_or_missing_urls=0,
        ranking_status="Rankings Recalculated",
        details=f"Unsynced {len(students_to_unsync)} students ({target_desc}, platform={plat})",
        created_at=now_unsync,
    )
    db.add(audit)
    settings = get_or_create_settings(db)
    settings.last_sync_at = now_unsync

    db.commit()
    ranking_summary = recalculate_all_rankings(db)

    return {
        "success": True,
        "unsynced_count": len(students_to_unsync),
        "message": f"Successfully unsynced {len(students_to_unsync)} student record(s). All rankings recalculated.",
        "target": target_desc,
        "platform": plat,
        "ranking_summary": ranking_summary,
    }


@app.put("/api/admin/settings")
@app.put("/api/v1/admin/settings")
def update_settings(
    req: SettingsUpdateRequest,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    total_w = req.leetcode_weight + req.github_weight
    if total_w <= 0:
        raise HTTPException(status_code=400, detail="Weights must sum to a positive number")

    w_lc = round(req.leetcode_weight / total_w, 4)
    w_gh = round(1.0 - w_lc, 4)

    settings = get_or_create_settings(db)
    settings.leetcode_weight = w_lc
    settings.github_weight = w_gh
    settings.mask_roll_numbers = req.mask_roll_numbers
    db.commit()

    ranking_summary = recalculate_all_rankings(db)
    return {
        "leetcode_weight": settings.leetcode_weight,
        "github_weight": settings.github_weight,
        "mask_roll_numbers": settings.mask_roll_numbers,
        "ranking_summary": ranking_summary,
    }


# =========================================================================
# React SPA Static Files & Fallback Serving (Belt-and-Suspenders)
# =========================================================================
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

DIST_DIR = os.path.join(ROOT_DIR, "frontend", "dist")
if not os.path.isdir(DIST_DIR):
    DIST_DIR = os.path.join(BACKEND_DIR, "..", "frontend", "dist")
DIST_DIR = os.path.abspath(DIST_DIR)

if os.path.isdir(DIST_DIR):
    assets_dir = os.path.join(DIST_DIR, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa_fallback(full_path: str):
        # Do not hijack any API routes
        if (
            full_path.startswith("api/")
            or full_path.startswith("v1/")
            or full_path in ("api", "v1")
            or full_path.endswith("index.py")
        ):
            raise HTTPException(status_code=404, detail="API endpoint not found")

        # If a specific static file exists in dist (e.g. logo.svg, favicon.ico)
        target_file = os.path.join(DIST_DIR, full_path)
        if full_path and os.path.isfile(target_file):
            return FileResponse(target_file)

        # Fallback to SPA index.html for all client routes
        index_file = os.path.join(DIST_DIR, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)

        return {"message": "Teddy Ranks API"}

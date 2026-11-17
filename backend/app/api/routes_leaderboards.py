import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if _BACKEND_DIR not in sys.path:
    sys.path.insert(0, _BACKEND_DIR)

import math
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Student, SystemSettings
from ranking import get_or_create_settings
from schemas import LeaderboardResponse, StudentSummary
from app.api.routes_dashboard import _student_to_summary

router = APIRouter(prefix="/api/v1/leaderboards", tags=["leaderboards"])


def _rank_key_for_tab(s: Student, tab: str):
    if tab == "leetcode":
        return (0 if s.lc_college_rank is not None else 1, s.lc_college_rank or 999999, s.roll_number)
    if tab == "github":
        return (0 if s.gh_college_rank is not None else 1, s.gh_college_rank or 999999, s.roll_number)
    if tab in ("II Year", "III Year", "IV Year"):
        return (0 if s.overall_batch_rank is not None else 1, s.overall_batch_rank or 999999, s.roll_number)
    return (0 if s.overall_college_rank is not None else 1, s.overall_college_rank or 999999, s.roll_number)


@router.get("", response_model=LeaderboardResponse)
def get_leaderboards_combined(
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
        # Default tab-based logic
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

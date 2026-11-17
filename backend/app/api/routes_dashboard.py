from datetime import datetime, timezone
import json
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import AuditLog, MetricSnapshot, Student, SystemSettings
from ranking import get_or_create_settings
from schemas import BatchDistributionItem, DashboardSummaryResponse, StudentSummary, to_utc_z

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])


def _student_to_summary(s: Student, mask_enabled: bool, display_rank: Optional[int] = None) -> StudentSummary:
    from main import mask_roll_number, _parse_languages

    lc_ok = s.lc_status == "VERIFIED"
    gh_ok = s.gh_status == "VERIFIED"

    return StudentSummary(
        roll_number=s.roll_number,
        display_roll_number=mask_roll_number(s.roll_number, mask_enabled),
        name=s.name,
        batch=s.batch,
        profile_coverage=s.profile_coverage,
        ranking_status=s.ranking_status,
        overall_score=round(s.overall_score, 2) if s.overall_score is not None else None,
        overall_college_rank=s.overall_college_rank,
        overall_batch_rank=s.overall_batch_rank,
        display_rank=display_rank,
        lc_status=s.lc_status,
        lc_username=s.lc_username,
        lc_clean_url=s.lc_clean_url,
        lc_score=round(s.lc_score, 2) if (lc_ok and s.lc_score is not None) else None,
        lc_college_rank=s.lc_college_rank,
        lc_batch_rank=s.lc_batch_rank,
        lc_total_solved=s.lc_total_solved if lc_ok else None,
        lc_easy_solved=s.lc_easy_solved if lc_ok else None,
        lc_medium_solved=s.lc_medium_solved if lc_ok else None,
        lc_hard_solved=s.lc_hard_solved if lc_ok else None,
        lc_contest_rating=round(s.lc_contest_rating, 2) if (lc_ok and s.lc_contest_rating is not None) else None,
        lc_contests_attended=s.lc_contests_attended if lc_ok else None,
        lc_last_updated=s.lc_last_updated if lc_ok else None,
        gh_status=s.gh_status,
        gh_username=s.gh_username,
        gh_clean_url=s.gh_clean_url,
        gh_score=round(s.gh_score, 2) if (gh_ok and s.gh_score is not None) else None,
        gh_college_rank=s.gh_college_rank,
        gh_batch_rank=s.gh_batch_rank,
        gh_public_repos=s.gh_public_repos if gh_ok else None,
        gh_original_repos=s.gh_original_repos if gh_ok else None,
        gh_total_stars=s.gh_total_stars if gh_ok else None,
        gh_followers=s.gh_followers if gh_ok else None,
        gh_recent_active_repos_90d=s.gh_recent_active_repos_90d if gh_ok else None,
        gh_top_languages=_parse_languages(s.gh_top_languages) if gh_ok else [],
        gh_distinct_languages_count=s.gh_distinct_languages_count if gh_ok else None,
        gh_last_updated=s.gh_last_updated if gh_ok else None,
    )


@router.get("/summary", response_model=DashboardSummaryResponse)
def get_dashboard_summary_v1(db: Session = Depends(get_db)):
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

from datetime import datetime, timezone
import math
from typing import List
from sqlalchemy.orm import Session
from models import MetricSnapshot, Student, SystemSettings


def create_snapshot(db: Session, student: Student, source: str = "LIVE_SYNC") -> MetricSnapshot:
    """Record a historical snapshot of a student's verified metrics and current ranks."""
    snap = MetricSnapshot(
        student_id=student.id,
        roll_number=student.roll_number,
        recorded_at=datetime.now(timezone.utc),
        source=source,
        lc_total_solved=student.lc_total_solved if student.lc_status == "VERIFIED" else None,
        lc_easy_solved=student.lc_easy_solved if student.lc_status == "VERIFIED" else None,
        lc_medium_solved=student.lc_medium_solved if student.lc_status == "VERIFIED" else None,
        lc_hard_solved=student.lc_hard_solved if student.lc_status == "VERIFIED" else None,
        lc_contest_rating=student.lc_contest_rating if student.lc_status == "VERIFIED" else None,
        lc_score=student.lc_score if student.lc_status == "VERIFIED" else None,
        gh_original_repos=student.gh_original_repos if student.gh_status == "VERIFIED" else None,
        gh_total_stars=student.gh_total_stars if student.gh_status == "VERIFIED" else None,
        gh_recent_active_repos_90d=student.gh_recent_active_repos_90d if student.gh_status == "VERIFIED" else None,
        gh_score=student.gh_score if student.gh_status == "VERIFIED" else None,
        overall_score=student.overall_score,
        overall_college_rank=student.overall_college_rank,
    )
    db.add(snap)
    return snap


def get_or_create_settings(db: Session) -> SystemSettings:
    settings = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    if settings is None:
        settings = SystemSettings(
            id=1,
            leetcode_weight=0.60,
            github_weight=0.40,
            provisional_multiplier=0.80,
            mask_roll_numbers=False,
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _normalize_percentile(students: List[Student], raw_attr: str, score_attr: str) -> None:
    verified = [s for s in students if getattr(s, raw_attr) is not None]
    if not verified:
        return

    raw_vals = [float(getattr(s, raw_attr)) for s in verified]
    max_val = max(raw_vals)

    if max_val <= 0.0:
        for s in verified:
            setattr(s, score_attr, 0.0)
        return

    n = len(verified)
    if n == 1:
        setattr(verified[0], score_attr, 100.0 if raw_vals[0] > 0.0 else 0.0)
        return

    for s in verified:
        val = float(getattr(s, raw_attr))
        if val <= 0.0:
            setattr(s, score_attr, 0.0)
            continue
        less = sum(1 for v in raw_vals if v < val)
        equal = sum(1 for v in raw_vals if abs(v - val) < 1e-12)
        pct = ((less + 0.5 * (equal - 1)) / (n - 1)) * 100.0
        setattr(s, score_attr, round(pct, 2))


def recalculate_all_rankings(db: Session) -> dict:
    """
    Recompute LeetCode Raw Index, GitHub Raw Index, 0-100 Percentile Scores,
    Combined Overall Score, Coverage / Status, and all 6 ranks across the database.
    """
    settings = get_or_create_settings(db)
    w_lc = float(settings.leetcode_weight)
    w_gh = float(settings.github_weight)
    prov_mult = float(settings.provisional_multiplier or 0.80)

    students: List[Student] = db.query(Student).all()

    # Step 1: Raw Indices (reset unverified fields cleanly)
    for s in students:
        if s.lc_status == "VERIFIED" and s.lc_easy_solved is not None:
            easy = float(s.lc_easy_solved or 0)
            med = float(s.lc_medium_solved or 0)
            hard = float(s.lc_hard_solved or 0)
            weighted_solved = 1.0 * easy + 2.5 * med + 5.0 * hard
            rating_term = max(0.0, float(s.lc_contest_rating or 0.0) - 1200.0)
            s.lc_raw_index = 0.60 * math.log(1.0 + weighted_solved) + 0.40 * math.log(1.0 + rating_term)
        else:
            s.lc_raw_index = None
            s.lc_score = None
            s.lc_college_rank = None
            s.lc_batch_rank = None

        if s.gh_status == "VERIFIED" and s.gh_original_repos is not None:
            stars = float(s.gh_total_stars or 0)
            orig_repos = float(s.gh_original_repos or 0)
            active_90d = float(s.gh_recent_active_repos_90d or 0)
            langs_cnt = float(s.gh_distinct_languages_count or 0)
            followers = float(s.gh_followers or 0)
            s.gh_raw_index = (
                3.0 * math.log(1.0 + stars)
                + 2.5 * math.log(1.0 + orig_repos)
                + 2.0 * active_90d
                + 1.5 * langs_cnt
                + 1.0 * math.log(1.0 + followers)
            )
        else:
            s.gh_raw_index = None
            s.gh_score = None
            s.gh_college_rank = None
            s.gh_batch_rank = None

    # Step 2: 0-100 Percentile Normalization per platform across verified students
    _normalize_percentile(students, "lc_raw_index", "lc_score")
    _normalize_percentile(students, "gh_raw_index", "gh_score")

    # Step 3: Combined Overall Score & Profile Coverage / Ranking Status
    for s in students:
        has_lc = s.lc_status == "VERIFIED" and s.lc_score is not None
        has_gh = s.gh_status == "VERIFIED" and s.gh_score is not None

        if has_lc and has_gh:
            s.profile_coverage = "2/2"
            s.ranking_status = "CONFIRMED"
            s.overall_score = round(w_lc * float(s.lc_score) + w_gh * float(s.gh_score), 2)
        elif has_lc or has_gh:
            s.profile_coverage = "1/2"
            s.ranking_status = "PROVISIONAL"
            avail = float(s.lc_score if has_lc else s.gh_score)
            s.overall_score = round(prov_mult * avail, 2)
        else:
            s.profile_coverage = "0/2"
            s.ranking_status = "UNRANKED"
            s.overall_score = None

        s.overall_college_rank = None
        s.overall_batch_rank = None
        s.lc_college_rank = None
        s.lc_batch_rank = None
        s.gh_college_rank = None
        s.gh_batch_rank = None

    # Step 4: Overall College & Overall Batch Ranks (Confirmed before Provisional)
    ranked_overall = [s for s in students if s.ranking_status in ("CONFIRMED", "PROVISIONAL")]
    ranked_overall.sort(
        key=lambda s: (
            0 if s.ranking_status == "CONFIRMED" else 1,
            -(s.overall_score or 0.0),
            -(s.lc_score if s.lc_score is not None else -1.0),
            -(s.gh_score if s.gh_score is not None else -1.0),
            s.roll_number,
        )
    )
    batch_counters = {}
    for idx, s in enumerate(ranked_overall, start=1):
        s.overall_college_rank = idx
        b_idx = batch_counters.get(s.batch, 0) + 1
        batch_counters[s.batch] = b_idx
        s.overall_batch_rank = b_idx

    # Step 5: LeetCode College & Batch Ranks
    ranked_lc = [s for s in students if s.lc_status == "VERIFIED" and s.lc_raw_index is not None]
    ranked_lc.sort(
        key=lambda s: (
            -(s.lc_raw_index or 0.0),
            -(s.lc_total_solved or 0),
            -(s.lc_contest_rating or 0.0),
            s.roll_number,
        )
    )
    lc_batch_counters = {}
    for idx, s in enumerate(ranked_lc, start=1):
        s.lc_college_rank = idx
        b_idx = lc_batch_counters.get(s.batch, 0) + 1
        lc_batch_counters[s.batch] = b_idx
        s.lc_batch_rank = b_idx

    # Step 6: GitHub College & Batch Ranks
    ranked_gh = [s for s in students if s.gh_status == "VERIFIED" and s.gh_raw_index is not None]
    ranked_gh.sort(
        key=lambda s: (
            -(s.gh_raw_index or 0.0),
            -(s.gh_total_stars or 0),
            -(s.gh_original_repos or 0),
            s.roll_number,
        )
    )
    gh_batch_counters = {}
    for idx, s in enumerate(ranked_gh, start=1):
        s.gh_college_rank = idx
        b_idx = gh_batch_counters.get(s.batch, 0) + 1
        gh_batch_counters[s.batch] = b_idx
        s.gh_batch_rank = b_idx

    db.commit()

    return {
        "total_students": len(students),
        "confirmed": sum(1 for s in students if s.ranking_status == "CONFIRMED"),
        "provisional": sum(1 for s in students if s.ranking_status == "PROVISIONAL"),
        "unranked": sum(1 for s in students if s.ranking_status == "UNRANKED"),
        "lc_verified": len(ranked_lc),
        "gh_verified": len(ranked_gh),
    }

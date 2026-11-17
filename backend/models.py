from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship
from database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    roll_number = Column(String(32), unique=True, index=True, nullable=False)
    name = Column(String(200), index=True, nullable=False)
    batch = Column(String(32), index=True, nullable=False)
    excel_link_status = Column(String(64), nullable=True)

    # LeetCode fields
    lc_raw_url = Column(String(500), nullable=True)
    lc_clean_url = Column(String(300), nullable=True)
    lc_username = Column(String(100), index=True, nullable=True)
    lc_status = Column(String(32), default="MISSING", nullable=False)
    lc_error_message = Column(String(300), nullable=True)
    lc_total_solved = Column(Integer, nullable=True)
    lc_easy_solved = Column(Integer, nullable=True)
    lc_medium_solved = Column(Integer, nullable=True)
    lc_hard_solved = Column(Integer, nullable=True)
    lc_contest_rating = Column(Float, nullable=True)
    lc_contests_attended = Column(Integer, nullable=True)
    lc_raw_index = Column(Float, nullable=True)
    lc_score = Column(Float, nullable=True)
    lc_last_updated = Column(DateTime(timezone=True), nullable=True)

    # GitHub fields
    gh_raw_url = Column(String(500), nullable=True)
    gh_clean_url = Column(String(300), nullable=True)
    gh_username = Column(String(100), index=True, nullable=True)
    gh_status = Column(String(32), default="MISSING", nullable=False)
    gh_error_message = Column(String(300), nullable=True)
    gh_public_repos = Column(Integer, nullable=True)
    gh_original_repos = Column(Integer, nullable=True)
    gh_total_stars = Column(Integer, nullable=True)
    gh_followers = Column(Integer, nullable=True)
    gh_recent_active_repos_90d = Column(Integer, nullable=True)
    gh_top_languages = Column(Text, nullable=True)  # JSON array of strings
    gh_distinct_languages_count = Column(Integer, nullable=True)
    gh_raw_index = Column(Float, nullable=True)
    gh_score = Column(Float, nullable=True)
    gh_last_updated = Column(DateTime(timezone=True), nullable=True)

    # Combined ranking & 6 ranks
    overall_score = Column(Float, nullable=True)
    ranking_status = Column(String(32), default="UNRANKED", nullable=False)
    profile_coverage = Column(String(16), default="0/2", nullable=False)
    overall_college_rank = Column(Integer, index=True, nullable=True)
    overall_batch_rank = Column(Integer, index=True, nullable=True)
    lc_college_rank = Column(Integer, index=True, nullable=True)
    lc_batch_rank = Column(Integer, index=True, nullable=True)
    gh_college_rank = Column(Integer, index=True, nullable=True)
    gh_batch_rank = Column(Integer, index=True, nullable=True)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    snapshots = relationship(
        "MetricSnapshot",
        back_populates="student",
        cascade="all, delete-orphan",
        order_by="MetricSnapshot.recorded_at.asc()",
    )


class MetricSnapshot(Base):
    __tablename__ = "metric_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), index=True, nullable=False)
    roll_number = Column(String(32), index=True, nullable=False)
    recorded_at = Column(DateTime(timezone=True), default=utc_now, index=True, nullable=False)
    source = Column(String(32), nullable=False)  # LIVE_SYNC | CSV_UPLOAD | DEMO_SEED

    lc_total_solved = Column(Integer, nullable=True)
    lc_easy_solved = Column(Integer, nullable=True)
    lc_medium_solved = Column(Integer, nullable=True)
    lc_hard_solved = Column(Integer, nullable=True)
    lc_contest_rating = Column(Float, nullable=True)
    lc_score = Column(Float, nullable=True)

    gh_original_repos = Column(Integer, nullable=True)
    gh_total_stars = Column(Integer, nullable=True)
    gh_recent_active_repos_90d = Column(Integer, nullable=True)
    gh_score = Column(Float, nullable=True)

    overall_score = Column(Float, nullable=True)
    overall_college_rank = Column(Integer, nullable=True)

    student = relationship("Student", back_populates="snapshots")


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True)
    leetcode_weight = Column(Float, default=0.60, nullable=False)
    github_weight = Column(Float, default=0.40, nullable=False)
    provisional_multiplier = Column(Float, default=0.80, nullable=False)
    mask_roll_numbers = Column(Boolean, default=False, nullable=False)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_ingest_at = Column(DateTime(timezone=True), nullable=True)
    last_ingest_summary = Column(Text, nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(64), default="EXCEL_IMPORT", nullable=False)
    file_name = Column(String(255), nullable=True)
    sheets_read = Column(String(255), nullable=True)
    total_rows = Column(Integer, default=0, nullable=False)
    new_students_added = Column(Integer, default=0, nullable=False)
    updated_students = Column(Integer, default=0, nullable=False)
    valid_leetcode_urls = Column(Integer, default=0, nullable=False)
    valid_github_urls = Column(Integer, default=0, nullable=False)
    invalid_or_missing_urls = Column(Integer, default=0, nullable=False)
    ranking_status = Column(String(64), default="Rankings Recalculated", nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

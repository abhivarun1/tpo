from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_serializer


def to_utc_z(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    iso = dt.isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    if not iso.endswith("Z"):
        return iso + "Z"
    return iso


class StudentSummary(BaseModel):
    roll_number: str
    display_roll_number: str
    name: str
    batch: str
    profile_coverage: str
    ranking_status: str
    overall_score: Optional[float] = None
    overall_college_rank: Optional[int] = None
    overall_batch_rank: Optional[int] = None
    display_rank: Optional[int] = None

    lc_status: str
    lc_username: Optional[str] = None
    lc_clean_url: Optional[str] = None
    lc_score: Optional[float] = None
    lc_college_rank: Optional[int] = None
    lc_batch_rank: Optional[int] = None
    lc_total_solved: Optional[int] = None
    lc_easy_solved: Optional[int] = None
    lc_medium_solved: Optional[int] = None
    lc_hard_solved: Optional[int] = None
    lc_contest_rating: Optional[float] = None
    lc_contests_attended: Optional[int] = None
    lc_last_updated: Optional[datetime] = None

    gh_status: str
    gh_username: Optional[str] = None
    gh_clean_url: Optional[str] = None
    gh_score: Optional[float] = None
    gh_college_rank: Optional[int] = None
    gh_batch_rank: Optional[int] = None
    gh_public_repos: Optional[int] = None
    gh_original_repos: Optional[int] = None
    gh_total_stars: Optional[int] = None
    gh_followers: Optional[int] = None
    gh_recent_active_repos_90d: Optional[int] = None
    gh_top_languages: List[str] = Field(default_factory=list)
    gh_distinct_languages_count: Optional[int] = None
    gh_last_updated: Optional[datetime] = None

    @field_serializer("lc_last_updated", "gh_last_updated")
    def serialize_student_dt(self, val: Optional[datetime]) -> Optional[str]:
        return to_utc_z(val)


class SnapshotItem(BaseModel):
    id: int
    recorded_at: datetime
    source: str
    lc_total_solved: Optional[int] = None
    lc_easy_solved: Optional[int] = None
    lc_medium_solved: Optional[int] = None
    lc_hard_solved: Optional[int] = None
    lc_contest_rating: Optional[float] = None
    lc_score: Optional[float] = None
    gh_original_repos: Optional[int] = None
    gh_total_stars: Optional[int] = None
    gh_recent_active_repos_90d: Optional[int] = None
    gh_score: Optional[float] = None
    overall_score: Optional[float] = None
    overall_college_rank: Optional[int] = None

    @field_serializer("recorded_at")
    def serialize_recorded_at(self, val: datetime) -> Optional[str]:
        return to_utc_z(val)


class StudentDetailResponse(StudentSummary):
    excel_link_status: Optional[str] = None
    lc_raw_url: Optional[str] = None
    lc_error_message: Optional[str] = None
    lc_raw_index: Optional[float] = None
    gh_raw_url: Optional[str] = None
    gh_error_message: Optional[str] = None
    gh_raw_index: Optional[float] = None
    benchmarks: Dict[str, Optional[float]] = Field(default_factory=dict)
    snapshots: List[SnapshotItem] = Field(default_factory=list)


class LeaderboardResponse(BaseModel):
    tab: str
    total: int
    page: int
    page_size: int
    total_pages: int
    confirmed_only: bool
    include_unranked: bool
    mask_roll_numbers: bool
    items: List[StudentSummary]


class BatchDistributionItem(BaseModel):
    batch: str
    total: int
    confirmed: int
    provisional: int
    unranked: int
    lc_valid_urls: int
    gh_valid_urls: int
    lc_verified: int
    gh_verified: int


class DashboardSummaryResponse(BaseModel):
    total_students: int
    confirmed_count: int
    provisional_count: int
    verified_profiles_count: int
    unranked_count: int
    incomplete_unverified_count: int
    lc_valid_urls: int
    lc_invalid_urls: int
    lc_missing_urls: int
    lc_verified: int
    lc_fetch_failed: int
    gh_valid_urls: int
    gh_invalid_urls: int
    gh_missing_urls: int
    gh_verified: int
    gh_fetch_failed: int
    leetcode_weight: float
    github_weight: float
    provisional_multiplier: float
    mask_roll_numbers: bool
    last_sync: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    last_ingest_at: Optional[datetime] = None
    last_ingest_summary: Optional[Dict[str, Any]] = None
    batch_distribution: List[BatchDistributionItem]
    top_overall: List[StudentSummary]
    top_leetcode: List[StudentSummary]
    top_github: List[StudentSummary]

    @field_serializer("last_sync_at", "last_ingest_at")
    def serialize_summary_dt(self, val: Optional[datetime]) -> Optional[str]:
        return to_utc_z(val)


class AuditLogItem(BaseModel):
    id: int
    action: str
    file_name: Optional[str] = None
    sheets_read: Optional[str] = None
    total_rows: int
    new_students_added: int
    updated_students: int
    valid_leetcode_urls: int
    valid_github_urls: int
    invalid_or_missing_urls: int
    ranking_status: str
    details: Optional[str] = None
    created_at: datetime

    @field_serializer("created_at")
    def serialize_created_at(self, val: datetime) -> Optional[str]:
        return to_utc_z(val)


class FolderScanResponse(BaseModel):
    files_found: int
    files_processed: int
    results: List[Dict[str, Any]]
    ranking_recalculated: bool
    auto_sync_started: bool


class BatchSyncRequest(BaseModel):
    batch: str = "ALL"
    platform: str = "both"  # both | github | leetcode
    limit: int = Field(default=25, ge=1, le=2071)
    only_unverified: bool = True


class UnsyncRequest(BaseModel):
    roll_number: Optional[str] = None  # single or comma-separated list of roll numbers
    batch: Optional[str] = None  # "II Year", "III Year", "IV Year", or "ALL"
    platform: str = "all"  # "all", "leetcode", "github"


class SettingsUpdateRequest(BaseModel):
    leetcode_weight: float = Field(ge=0.0, le=1.0)
    github_weight: float = Field(ge=0.0, le=1.0)
    mask_roll_numbers: bool = False

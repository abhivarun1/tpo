export type PlatformStatus = "VERIFIED" | "PENDING" | "INVALID_URL" | "MISSING" | "FETCH_FAILED";
export type RankingStatus = "CONFIRMED" | "PROVISIONAL" | "UNRANKED";

export interface StudentSummary {
  roll_number: string;
  display_roll_number: string;
  name: string;
  batch: string;
  profile_coverage: string;
  ranking_status: RankingStatus;
  overall_score: number | null;
  overall_college_rank: number | null;
  overall_batch_rank: number | null;
  display_rank: number | null;

  lc_status: PlatformStatus;
  lc_username: string | null;
  lc_clean_url: string | null;
  lc_score: number | null;
  lc_college_rank: number | null;
  lc_batch_rank: number | null;
  lc_total_solved: number | null;
  lc_easy_solved: number | null;
  lc_medium_solved: number | null;
  lc_hard_solved: number | null;
  lc_contest_rating: number | null;
  lc_contests_attended: number | null;
  lc_last_updated: string | null;

  gh_status: PlatformStatus;
  gh_username: string | null;
  gh_clean_url: string | null;
  gh_score: number | null;
  gh_college_rank: number | null;
  gh_batch_rank: number | null;
  gh_public_repos: number | null;
  gh_original_repos: number | null;
  gh_total_stars: number | null;
  gh_followers: number | null;
  gh_recent_active_repos_90d: number | null;
  gh_top_languages: string[];
  gh_distinct_languages_count: number | null;
  gh_last_updated: string | null;
}

export interface SnapshotItem {
  id: number;
  recorded_at: string;
  source: string;
  lc_total_solved: number | null;
  lc_easy_solved: number | null;
  lc_medium_solved: number | null;
  lc_hard_solved: number | null;
  lc_contest_rating: number | null;
  lc_score: number | null;
  gh_original_repos: number | null;
  gh_total_stars: number | null;
  gh_recent_active_repos_90d: number | null;
  gh_score: number | null;
  overall_score: number | null;
  overall_college_rank: number | null;
}

export interface StudentDetail extends StudentSummary {
  excel_link_status: string | null;
  lc_raw_url: string | null;
  lc_error_message: string | null;
  lc_raw_index: number | null;
  gh_raw_url: string | null;
  gh_error_message: string | null;
  gh_raw_index: number | null;
  benchmarks: {
    batch_avg_overall: number | null;
    batch_avg_lc: number | null;
    batch_avg_gh: number | null;
    college_avg_overall: number | null;
    college_avg_lc: number | null;
    college_avg_gh: number | null;
    college_top_overall: number | null;
  };
  snapshots: SnapshotItem[];
}

export interface LeaderboardResponse {
  tab: string;
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  confirmed_only: boolean;
  include_unranked: boolean;
  mask_roll_numbers: boolean;
  items: StudentSummary[];
}

export interface BatchDistributionItem {
  batch: string;
  total: number;
  confirmed: number;
  provisional: number;
  unranked: number;
  lc_valid_urls: number;
  gh_valid_urls: number;
  lc_verified: number;
  gh_verified: number;
}

export interface IngestSummaryReport {
  total_rows_processed: number;
  inserted: number;
  updated: number;
  batches: Record<string, number>;
  leetcode: {
    valid: number;
    invalid_url: number;
    missing: number;
    sample_invalid: Array<{ roll_number: string; name: string; raw_url: string; reason: string }>;
  };
  github: {
    valid: number;
    invalid_url: number;
    missing: number;
    sample_invalid: Array<{ roll_number: string; name: string; raw_url: string; reason: string }>;
  };
  coverage_potential: {
    both_valid_urls: number;
    one_valid_url: number;
    no_valid_urls: number;
  };
  ranking_summary: Record<string, number>;
}

export interface DashboardSummary {
  total_students: number;
  confirmed_count: number;
  provisional_count: number;
  verified_profiles_count: number;
  unranked_count: number;
  incomplete_unverified_count: number;
  lc_valid_urls: number;
  lc_invalid_urls: number;
  lc_missing_urls: number;
  lc_verified: number;
  lc_fetch_failed: number;
  gh_valid_urls: number;
  gh_invalid_urls: number;
  gh_missing_urls: number;
  gh_verified: number;
  gh_fetch_failed: number;
  leetcode_weight: number;
  github_weight: number;
  provisional_multiplier: number;
  mask_roll_numbers: boolean;
  last_sync?: string | null;
  last_sync_at: string | null;
  last_ingest_at: string | null;
  last_ingest_summary: IngestSummaryReport | null;
  batch_distribution: BatchDistributionItem[];
  top_overall: StudentSummary[];
  top_leetcode: StudentSummary[];
  top_github: StudentSummary[];
}

export interface AuditLogItem {
  id: number;
  action: string;
  file_name: string | null;
  sheets_read: string | null;
  total_rows: number;
  new_students_added: number;
  updated_students: number;
  valid_leetcode_urls: number;
  valid_github_urls: number;
  invalid_or_missing_urls: number;
  ranking_status: string;
  details: string | null;
  created_at: string;
}

export interface FolderScanResponse {
  files_found: number;
  files_processed: number;
  results: Array<{
    file_name: string;
    sheets_read?: string[];
    total_rows_processed?: number;
    inserted?: number;
    updated?: number;
    valid_leetcode_urls?: number;
    valid_github_urls?: number;
    invalid_or_missing_urls?: number;
    error?: string;
    status?: string;
  }>;
  ranking_recalculated: boolean;
  auto_sync_started: boolean;
}

export interface SyncStatus {
  is_running: boolean;
  batch: string;
  platform: string;
  total_targets: number;
  processed: number;
  gh_verified: number;
  gh_failed: number;
  lc_verified: number;
  lc_failed: number;
  gh_circuit_open: boolean;
  lc_circuit_open: boolean;
  circuit_breaker_reason: string | null;
  current_student: string | null;
  started_at: string | null;
  finished_at: string | null;
  logs: string[];
}

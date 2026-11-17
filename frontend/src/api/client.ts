import type {
  AuditLogItem,
  DashboardSummary,
  FolderScanResponse,
  IngestSummaryReport,
  LeaderboardResponse,
  StudentDetail,
  StudentSummary,
  SyncStatus,
} from "../types";

const API_BASE = "/api";

async function handleResponse<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let message = `Request failed (${resp.status})`;
    try {
      const data = await resp.json();
      if (data?.detail) {
        message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      }
    } catch {
      // ignore json parse failure
    }
    throw new Error(message);
  }
  return resp.json() as Promise<T>;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const resp = await fetch(`${API_BASE}/stats/summary`);
  return handleResponse<DashboardSummary>(resp);
}

export async function searchStudents(query: string, limit = 12): Promise<StudentSummary[]> {
  if (!query.trim()) return [];
  const params = new URLSearchParams({ q: query.trim(), limit: String(limit) });
  const resp = await fetch(`${API_BASE}/students/search?${params.toString()}`);
  return handleResponse<StudentSummary[]>(resp);
}

export async function fetchLeaderboard(params: {
  tab: string;
  batch?: string;
  platform_combo?: string;
  platforms?: string;
  match_mode?: string;
  search?: string;
  confirmed_only?: boolean;
  include_unranked?: boolean;
  sort_by?: string;
  sort_dir?: string;
  page?: number;
  page_size?: number;
}): Promise<LeaderboardResponse> {
  const qs = new URLSearchParams({
    tab: params.tab,
    batch: params.batch || "all",
    platform_combo: params.platform_combo || "all",
    search: params.search || "",
    confirmed_only: String(Boolean(params.confirmed_only)),
    include_unranked: String(params.include_unranked ?? true),
    sort_by: params.sort_by || "rank",
    sort_dir: params.sort_dir || "asc",
    page: String(params.page || 1),
    page_size: String(params.page_size || 25),
  });
  if (params.platforms) {
    qs.append("platforms", params.platforms);
  }
  if (params.match_mode) {
    qs.append("match_mode", params.match_mode);
  }
  const resp = await fetch(`${API_BASE}/leaderboard?${qs.toString()}`);
  return handleResponse<LeaderboardResponse>(resp);
}

export async function fetchStudentProfile(rollNumber: string): Promise<StudentDetail> {
  const resp = await fetch(`${API_BASE}/students/${encodeURIComponent(rollNumber)}`);
  return handleResponse<StudentDetail>(resp);
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  const resp = await fetch(`${API_BASE}/admin/verify`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });
  return resp.ok;
}

export async function uploadExcelDataset(
  password: string,
  opts: { file?: File; files?: File[]; useDefault?: boolean; autoSync?: boolean }
): Promise<IngestSummaryReport | any> {
  const form = new FormData();
  form.append("use_default", String(Boolean(opts.useDefault)));
  form.append("auto_sync", String(Boolean(opts.autoSync)));
  if (opts.files && opts.files.length > 0) {
    for (const f of opts.files) {
      form.append("files", f);
    }
  } else if (opts.file) {
    form.append("file", opts.file);
  }
  const resp = await fetch(`${API_BASE}/admin/upload-excel`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
    body: form,
  });
  return handleResponse<any>(resp);
}

export async function scanFolderExcel(
  password: string,
  autoSync = false
): Promise<FolderScanResponse> {
  const resp = await fetch(`${API_BASE}/admin/import/scan-folder?auto_sync=${Boolean(autoSync)}`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });
  return handleResponse<FolderScanResponse>(resp);
}

export async function fetchAuditLogs(password: string, limit = 50): Promise<AuditLogItem[]> {
  const resp = await fetch(`${API_BASE}/admin/audit-logs?limit=${limit}`, {
    headers: { "X-Admin-Password": password },
  });
  return handleResponse<AuditLogItem[]>(resp);
}

export async function uploadCsvMetrics(
  password: string,
  opts: { file?: File; csvText?: string }
): Promise<{
  updated_rows: number;
  unique_students_updated: number;
  not_found: string[];
  invalid_rows: string[];
  ranking_summary: Record<string, number>;
}> {
  const form = new FormData();
  if (opts.file) {
    form.append("file", opts.file);
  }
  if (opts.csvText) {
    form.append("csv_text", opts.csvText);
  }
  const resp = await fetch(`${API_BASE}/admin/upload-csv`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
    body: form,
  });
  return handleResponse(resp);
}

export async function syncSingleStudent(
  password: string,
  rollNumber: string,
  platform = "both"
): Promise<{
  sync_result: {
    roll_number: string;
    updated_github: boolean;
    updated_leetcode: boolean;
    errors: string[];
  };
  student: StudentDetail;
}> {
  const resp = await fetch(
    `${API_BASE}/admin/sync/student/${encodeURIComponent(rollNumber)}?platform=${encodeURIComponent(platform)}`,
    {
      method: "POST",
      headers: { "X-Admin-Password": password },
    }
  );
  return handleResponse(resp);
}

export async function startBatchSync(
  password: string,
  payload: { batch: string; platform: string; limit: number; only_unverified: boolean }
): Promise<{ started: boolean; message: string; status: SyncStatus }> {
  const resp = await fetch(`${API_BASE}/admin/sync/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": password,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(resp);
}

export async function stopBatchSync(password: string): Promise<SyncStatus> {
  const resp = await fetch(`${API_BASE}/admin/sync/stop`, {
    method: "POST",
    headers: { "X-Admin-Password": password },
  });
  return handleResponse<SyncStatus>(resp);
}

export async function fetchSyncStatus(password: string): Promise<SyncStatus> {
  const resp = await fetch(`${API_BASE}/admin/sync-status`, {
    headers: { "X-Admin-Password": password },
  });
  return handleResponse<SyncStatus>(resp);
}

export async function unsyncStudents(
  password: string,
  payload: { roll_number?: string; batch?: string; platform?: string }
): Promise<{
  success: boolean;
  unsynced_count: number;
  message: string;
  target: string;
  platform: string;
  ranking_summary?: Record<string, number>;
}> {
  const resp = await fetch(`${API_BASE}/admin/unsync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": password,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(resp);
}

export async function updateAdminSettings(
  password: string,
  payload: { leetcode_weight: number; github_weight: number; mask_roll_numbers: boolean }
): Promise<{
  leetcode_weight: number;
  github_weight: number;
  mask_roll_numbers: boolean;
  ranking_summary: Record<string, number>;
}> {
  const resp = await fetch(`${API_BASE}/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Password": password,
    },
    body: JSON.stringify(payload),
  });
  return handleResponse(resp);
}

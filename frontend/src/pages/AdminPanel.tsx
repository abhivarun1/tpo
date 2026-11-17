import { FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Folder,
  History,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
  Sliders,
  Square,
  Upload,
} from "lucide-react";
import {
  fetchAuditLogs,
  fetchDashboardSummary,
  fetchSyncStatus,
  scanFolderExcel,
  startBatchSync,
  stopBatchSync,
  syncSingleStudent,
  unsyncStudents,
  updateAdminSettings,
  uploadCsvMetrics,
  uploadExcelDataset,
  verifyAdminPassword,
} from "../api/client";
import type { AuditLogItem, DashboardSummary, FolderScanResponse, SyncStatus } from "../types";
import { formatShortIST } from "../utils/formatDate";

const SAMPLE_CSV = `roll_number,platform,easy_solved,medium_solved,hard_solved,contest_rating,contests_attended,public_repos,original_repos,total_stars,followers,recent_active_repos_90d,top_languages
25B11CS001,leetcode,120,140,25,1725,12,,,,,,
25B11CS001,github,,,,,,18,16,24,15,5,Python|TypeScript|Java
`;

export function AdminPanel() {
  const [password, setPassword] = useState(() => sessionStorage.getItem("cse_rank_admin_pw") || "");
  const [pwInput, setPwInput] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  // Excel upload & Folder Scan
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelFiles, setExcelFiles] = useState<File[]>([]);
  const [autoSyncAfterImport, setAutoSyncAfterImport] = useState(false);
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestReport, setIngestReport] = useState<any | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<FolderScanResponse | null>(null);

  // History & Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // Live Sync
  const [singleRoll, setSingleRoll] = useState("");
  const [singlePlatform, setSinglePlatform] = useState("both");
  const [singleSyncMsg, setSingleSyncMsg] = useState<string | null>(null);
  const [singleSyncing, setSingleSyncing] = useState(false);

  const [batchFilter, setBatchFilter] = useState("ALL");
  const [batchPlatform, setBatchPlatform] = useState("both");
  const [batchLimit, setBatchLimit] = useState(25);
  const [onlyUnverified, setOnlyUnverified] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // CSV fallback upload
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvResult, setCsvResult] = useState<string | null>(null);

  // Settings
  const [lcWeightPct, setLcWeightPct] = useState(60);
  const [maskRolls, setMaskRolls] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

  // Unsync / Clear state
  const [unsyncRoll, setUnsyncRoll] = useState("");
  const [unsyncBatch, setUnsyncBatch] = useState("II Year");
  const [unsyncPlatform, setUnsyncPlatform] = useState("all");
  const [unsyncLoading, setUnsyncLoading] = useState(false);
  const [unsyncSuccessMsg, setUnsyncSuccessMsg] = useState<string | null>(null);
  const [unsyncErrorMsg, setUnsyncErrorMsg] = useState<string | null>(null);

  const loadDashboard = async () => {
    try {
      const s = await fetchDashboardSummary();
      setSummary(s);
      setLcWeightPct(Math.round(s.leetcode_weight * 100));
      setMaskRolls(s.mask_roll_numbers);
    } catch {
      // ignore
    }
  };

  const loadAuditLogs = async (pw = password) => {
    if (!pw) return;
    try {
      setAuditLoading(true);
      const logs = await fetchAuditLogs(pw, 20);
      setAuditLogs(logs);
    } catch {
      // ignore
    } finally {
      setAuditLoading(false);
    }
  };

  useEffect(() => {
    if (password) {
      verifyAdminPassword(password).then((ok) => {
        if (ok) {
          setAuthenticated(true);
          sessionStorage.setItem("cse_rank_admin_pw", password);
          loadDashboard();
          loadAuditLogs(password);
        }
      });
    }
  }, [password]);

  // Poll sync status while batch is running
  useEffect(() => {
    if (!authenticated || !password) return;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const st = await fetchSyncStatus(password);
        setSyncStatus(st);
        if (st.is_running) {
          timer = window.setTimeout(poll, 1500);
        } else {
          loadDashboard();
          loadAuditLogs();
        }
      } catch {
        // ignore
      }
    };
    poll();
    return () => clearTimeout(timer);
  }, [authenticated, password]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const ok = await verifyAdminPassword(pwInput);
    if (ok) {
      setPassword(pwInput);
      setAuthenticated(true);
      sessionStorage.setItem("cse_rank_admin_pw", pwInput);
      loadDashboard();
      loadAuditLogs(pwInput);
    } else {
      setAuthError("Invalid admin password. Check backend/.env");
    }
  };

  const handleScanFolder = async () => {
    setScanLoading(true);
    setIngestError(null);
    setScanResult(null);
    setIngestReport(null);
    try {
      const res = await scanFolderExcel(password, autoSyncAfterImport);
      setScanResult(res);
      await loadDashboard();
      await loadAuditLogs();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Folder scan failed");
    } finally {
      setScanLoading(false);
    }
  };

  const handleExcelImport = async (useDefault: boolean) => {
    setIngestLoading(true);
    setIngestError(null);
    setIngestReport(null);
    setScanResult(null);
    try {
      const rep = await uploadExcelDataset(password, {
        useDefault,
        files: !useDefault && excelFiles.length > 0 ? excelFiles : undefined,
        file: !useDefault && excelFiles.length === 0 ? excelFile || undefined : undefined,
        autoSync: autoSyncAfterImport,
      });
      setIngestReport(rep);
      await loadDashboard();
      await loadAuditLogs();
    } catch (err) {
      setIngestError(err instanceof Error ? err.message : "Ingestion failed");
    } finally {
      setIngestLoading(false);
    }
  };

  const handleSingleSync = async (e: FormEvent) => {
    e.preventDefault();
    if (!singleRoll.trim()) return;
    setSingleSyncing(true);
    setSingleSyncMsg(null);
    try {
      const res = await syncSingleStudent(password, singleRoll.trim(), singlePlatform);
      setSingleSyncMsg(
        `Synced ${res.sync_result.roll_number}: GH=${res.student.gh_status}, LC=${res.student.lc_status}` +
          (res.sync_result.errors.length ? ` (${res.sync_result.errors.join("; ")})` : "")
      );
      await loadDashboard();
    } catch (err) {
      setSingleSyncMsg(err instanceof Error ? err.message : "Single sync failed");
    } finally {
      setSingleSyncing(false);
    }
  };

  const handleStartBatch = async () => {
    try {
      const res = await startBatchSync(password, {
        batch: batchFilter,
        platform: batchPlatform,
        limit: batchLimit,
        only_unverified: onlyUnverified,
      });
      setSyncStatus(res.status);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not start batch sync");
    }
  };

  const handleStopBatch = async () => {
    try {
      const st = await stopBatchSync(password);
      setSyncStatus(st);
    } catch {
      // ignore
    }
  };

  const handleCsvUpload = async (e: FormEvent) => {
    e.preventDefault();
    setCsvLoading(true);
    setCsvResult(null);
    try {
      const res = await uploadCsvMetrics(password, {
        file: csvFile || undefined,
        csvText: csvText.trim() || undefined,
      });
      setCsvResult(
        `Updated ${res.updated_rows} metric rows across ${res.unique_students_updated} students. ` +
          (res.not_found.length ? `Not found: ${res.not_found.join(", ")}. ` : "") +
          (res.invalid_rows.length ? `Issues: ${res.invalid_rows.join("; ")}` : "")
      );
      await loadDashboard();
    } catch (err) {
      setCsvResult(err instanceof Error ? err.message : "CSV upload failed");
    } finally {
      setCsvLoading(false);
    }
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cse_rank_bulk_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setSettingsMsg(null);
    const lcW = Number((lcWeightPct / 100).toFixed(2));
    const ghW = Number(((100 - lcWeightPct) / 100).toFixed(2));
    try {
      const res = await updateAdminSettings(password, {
        leetcode_weight: lcW,
        github_weight: ghW,
        mask_roll_numbers: maskRolls,
      });
      setSettingsMsg(
        `Saved! Weights set to ${Math.round(res.leetcode_weight * 100)}% LeetCode / ${Math.round(
          res.github_weight * 100
        )}% GitHub. All 2,071 rankings recalculated.`
      );
      await loadDashboard();
    } catch (err) {
      setSettingsMsg(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  const handleUnsyncRolls = async (e: FormEvent) => {
    e.preventDefault();
    if (!unsyncRoll.trim()) return;
    setUnsyncLoading(true);
    setUnsyncSuccessMsg(null);
    setUnsyncErrorMsg(null);
    try {
      const res = await unsyncStudents(password, {
        roll_number: unsyncRoll.trim(),
        platform: unsyncPlatform,
      });
      if (res.success) {
        setUnsyncSuccessMsg(
          `Successfully unsynced ${res.unsynced_count} student record(s) (${res.target}). Metrics cleared and rankings recalculated.`
        );
        setUnsyncRoll("");
        await loadDashboard();
      }
    } catch (err) {
      setUnsyncErrorMsg(err instanceof Error ? err.message : "Unsync failed");
    } finally {
      setUnsyncLoading(false);
    }
  };

  const handleUnsyncBatch = async () => {
    const confirmed = window.confirm(
      `Are you sure you want to unsync all fetched ${unsyncPlatform.toUpperCase()} metrics for all students in ${unsyncBatch}? This will reset their scores and revert rankings to unranked.`
    );
    if (!confirmed) return;
    setUnsyncLoading(true);
    setUnsyncSuccessMsg(null);
    setUnsyncErrorMsg(null);
    try {
      const res = await unsyncStudents(password, {
        batch: unsyncBatch,
        platform: unsyncPlatform,
      });
      if (res.success) {
        setUnsyncSuccessMsg(
          `Successfully unsynced ${res.unsynced_count} student record(s) in ${unsyncBatch} (${res.platform.toUpperCase()}). All rankings recalculated.`
        );
        await loadDashboard();
      }
    } catch (err) {
      setUnsyncErrorMsg(err instanceof Error ? err.message : "Batch unsync failed");
    } finally {
      setUnsyncLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#ffffff]">
        <div className="max-w-md mx-auto px-6 py-20">
          <form
            onSubmit={handleLogin}
            className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-8 shadow-sm space-y-5"
          >
            <div className="w-10 h-10 rounded-full bg-[#f0f4ff] border border-[#d6e0ff] flex items-center justify-center text-[#2e5bff]">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-medium text-[#201f20]">Admin Security Access</h1>
              <p className="text-xs text-[#606060] mt-1">
                Enter the administrator security password configured in <code className="font-mono text-[#201f20]">backend/.env</code> to unlock controls.
              </p>
            </div>
            {authError && (
              <div className="p-3 rounded-lg bg-[#fdeeee] border border-[#fad0d0] text-xs text-[#d93838]">
                {authError}
              </div>
            )}
            <input
              type="password"
              value={pwInput}
              onChange={(e) => setPwInput(e.target.value)}
              placeholder="Admin Security Password"
              autoComplete="current-password"
              className="w-full bg-[#f7f6f6] border border-[#e0e0df] focus:border-[#2e5bff] rounded-full px-4 py-2.5 text-sm text-[#201f20] outline-none"
            />
            <button
              type="submit"
              className="w-full py-2.5 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-[#fcfcfd] font-medium text-sm transition-colors"
            >
              Unlock Admin Panel
            </button>
          </form>
        </div>
      </div>
    );
  }

  const progressPct =
    syncStatus && syncStatus.total_targets > 0
      ? Math.round((syncStatus.processed / syncStatus.total_targets) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-[#201f20] tracking-tight">Admin Control Center</h1>
            <p className="text-sm text-[#494949] mt-1">
              Import Excel datasets, trigger live GitHub/LeetCode syncs, upload fallback CSVs, and tune ranking weights.
            </p>
          </div>
          {summary && (
            <div className="flex items-center gap-3 text-xs font-mono bg-[#f7f6f6] border border-[#e0e0df] px-4 py-2 rounded-full">
              <span className="text-[#606060]">Students:</span>
              <span className="text-[#201f20] font-bold">{summary.total_students}</span>
              <span className="text-[#e0e0df]">|</span>
              <span className="text-[#15966A]">{summary.confirmed_count} Confirmed</span>
              <span className="text-[#C58A18]">{summary.provisional_count} Prov</span>
            </div>
          )}
        </div>

        {/* Section A: Multi-Excel Ingestion & Folder Watcher */}
        <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-[#15966A]" />
              <div>
                <h2 className="text-base font-semibold text-[#201f20]">
                  1. Multi-Excel Ingestion &amp; Folder Watcher
                </h2>
                <p className="text-xs text-[#606060]">
                  Drop one or multiple workbooks into <code className="font-mono bg-[#f7f6f6] px-1 py-0.5 rounded border border-[#e0e0df]">backend/data_uploads/</code> or upload directly.
                </p>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#201f20] cursor-pointer bg-[#f7f6f6] px-3 py-1.5 rounded-full border border-[#e0e0df] hover:border-[#2e5bff] transition-colors">
              <input
                type="checkbox"
                checked={autoSyncAfterImport}
                onChange={(e) => setAutoSyncAfterImport(e.target.checked)}
                className="w-4 h-4 rounded accent-[#2e5bff]"
              />
              <span>Automatically sync GitHub &amp; LeetCode stats after import</span>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            {/* Action 1: Re-import default root excel */}
            <button
              type="button"
              disabled={ingestLoading || scanLoading}
              onClick={() => handleExcelImport(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#15966A] hover:bg-[#0f7a55] disabled:opacity-50 text-[#fcfcfd] text-xs sm:text-sm font-medium transition-colors shadow-sm"
            >
              <Database className="w-4 h-4" />
              {ingestLoading ? "Importing..." : "Re-import Root Dataset"}
            </button>

            {/* Action 2: Scan & Import Folder */}
            <button
              type="button"
              disabled={scanLoading || ingestLoading}
              onClick={handleScanFolder}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] disabled:opacity-50 text-[#fcfcfd] text-xs sm:text-sm font-medium transition-colors shadow-sm"
            >
              <Folder className="w-4 h-4" />
              {scanLoading ? "Scanning Folder..." : "Scan & Import Folder (backend/data_uploads/)"}
            </button>

            {/* Action 3: Multi-file picker & upload */}
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <input
                type="file"
                multiple
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const list = Array.from(e.target.files || []);
                  setExcelFiles(list);
                  setExcelFile(list[0] || null);
                }}
                className="text-xs text-[#494949] file:mr-2 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-[#f7f6f6] file:border-[#e0e0df] file:text-[#201f20] hover:file:bg-[#e0e0df]"
              />
              {excelFiles.length > 0 && (
                <span className="text-xs font-mono text-[#2e5bff] font-semibold bg-[#f0f4ff] px-2.5 py-1 rounded-full border border-[#d6e0ff]">
                  {excelFiles.length} file{excelFiles.length > 1 ? "s" : ""} selected
                </span>
              )}
              <button
                type="button"
                disabled={excelFiles.length === 0 || ingestLoading || scanLoading}
                onClick={() => handleExcelImport(false)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#f7f6f6] hover:bg-[#e0e0df] border border-[#e0e0df] disabled:opacity-40 text-[#201f20] text-xs sm:text-sm font-medium transition-colors"
              >
                <Upload className="w-4 h-4" /> Upload &amp; Ingest
              </button>
            </div>
          </div>

          {ingestError && (
            <div className="p-3.5 rounded-lg bg-[#fdeeee] border border-[#fad0d0] text-xs sm:text-sm text-[#d93838] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{ingestError}</span>
            </div>
          )}

          {scanResult && (
            <div className="p-4 rounded-lg bg-[#f0f4ff] border border-[#d6e0ff] text-xs sm:text-sm text-[#201f20] space-y-2">
              <div className="font-semibold flex items-center gap-2 text-[#2e5bff]">
                <CheckCircle2 className="w-4 h-4" />
                Folder Scan Completed ({scanResult.files_found} files found, {scanResult.files_processed} processed)
              </div>
              <div className="text-xs text-[#494949]">
                All student records upserted by Roll Number. Rankings recalculated cleanly.
                {scanResult.auto_sync_started && " Background live API metric sync initiated."}
              </div>
            </div>
          )}

          {ingestReport && (
            <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#ffffff] border border-[#e0e0df]">
                  <div className="text-[#606060]">Processed Rows</div>
                  <div className="text-lg font-mono font-bold text-[#201f20]">
                    {ingestReport.total_rows_processed ?? ingestReport.total_students ?? "—"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#ffffff] border border-[#e0e0df]">
                  <div className="text-[#606060]">Added / Updated</div>
                  <div className="text-sm font-mono font-bold text-[#15966A] mt-1">
                    +{ingestReport.inserted ?? 0} / {ingestReport.updated ?? 0}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#ffffff] border border-[#e0e0df]">
                  <div className="text-[#606060]">Valid URLs (LC / GH)</div>
                  <div className="text-sm font-mono font-bold text-[#2e5bff] mt-1">
                    {ingestReport.leetcode?.valid ?? ingestReport.valid_leetcode_urls ?? "—"} /{" "}
                    {ingestReport.github?.valid ?? ingestReport.valid_github_urls ?? "—"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-[#ffffff] border border-[#e0e0df]">
                  <div className="text-[#606060]">Rankings Status</div>
                  <div className="text-xs font-semibold text-[#15966A] mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Recalculated
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Excel Import & Filtering History Table */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#2e5bff]" />
                <h3 className="text-sm font-semibold text-[#201f20]">
                  Excel Import &amp; Filtering History
                </h3>
              </div>
              <button
                type="button"
                onClick={() => loadAuditLogs()}
                disabled={auditLoading}
                className="text-xs text-[#2e5bff] hover:underline flex items-center gap-1 font-medium"
              >
                <RefreshCw className={`w-3 h-3 ${auditLoading ? "animate-spin" : ""}`} />
                Refresh History
              </button>
            </div>

            <div className="rounded-lg border border-[#e0e0df] bg-[#ffffff] overflow-x-auto">
              <table className="w-full min-w-[760px] text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#e0e0df] bg-[#f7f6f6] text-[11px] uppercase tracking-wider text-[#494949]">
                    <th className="py-2.5 px-3 font-semibold">File / Operation</th>
                    <th className="py-2.5 px-3 font-semibold">Timestamp (IST)</th>
                    <th className="py-2.5 px-3 font-semibold">Sheets Read</th>
                    <th className="py-2.5 px-3 font-semibold">Total Rows</th>
                    <th className="py-2.5 px-3 font-semibold">Added / Updated</th>
                    <th className="py-2.5 px-3 font-semibold">Valid URLs (LC / GH)</th>
                    <th className="py-2.5 px-3 font-semibold">Ranking Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e0e0df]">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-[#606060]">
                        No import logs recorded yet. Ingest an Excel workbook to see audit records.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#f7f6f6] transition-colors">
                        <td className="py-2.5 px-3 font-medium text-[#201f20]">
                          <div className="flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#15966A] shrink-0" />
                            <span className="truncate max-w-[200px]" title={log.file_name || log.action}>
                              {log.file_name || log.action}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#606060]">
                          {formatShortIST(log.created_at)}
                        </td>
                        <td className="py-2.5 px-3 text-[#494949] max-w-[140px] truncate" title={log.sheets_read || "Default"}>
                          {log.sheets_read || "Students"}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#201f20]">
                          {log.total_rows.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          <span className="text-[#15966A]">+{log.new_students_added}</span>
                          <span className="text-[#606060]"> / </span>
                          <span className="text-[#201f20]">{log.updated_students}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#201f20]">
                          <span className="text-[#C58A18]">{log.valid_leetcode_urls} LC</span>
                          <span className="text-[#606060]"> • </span>
                          <span className="text-[#2e5bff]">{log.valid_github_urls} GH</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8f5ef] border border-[#bfe5d5] text-[11px] font-medium text-[#15966A]">
                            <CheckCircle2 className="w-3 h-3" />
                            {log.ranking_status || "Recalculated"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Section B: Live GitHub & LeetCode Sync */}
        <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-5 h-5 text-[#2e5bff]" />
            <h2 className="text-base font-semibold text-[#201f20]">2. Live GitHub &amp; LeetCode Collectors</h2>
          </div>

          {/* Single student sync */}
          <form onSubmit={handleSingleSync} className="p-4 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] space-y-3">
            <div className="text-sm font-semibold text-[#201f20]">Single Student Live Sync</div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                value={singleRoll}
                onChange={(e) => setSingleRoll(e.target.value)}
                placeholder="Roll Number (e.g. 25B11CS001)"
                className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-4 py-2 text-sm text-[#201f20] font-mono outline-none focus:border-[#2e5bff]"
              />
              <select
                value={singlePlatform}
                onChange={(e) => setSinglePlatform(e.target.value)}
                className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-4 py-2 text-sm text-[#201f20]"
              >
                <option value="both">Both Platforms</option>
                <option value="github">GitHub Only</option>
                <option value="leetcode">LeetCode Only</option>
              </select>
              <button
                type="submit"
                disabled={singleSyncing || !singleRoll.trim()}
                className="px-5 py-2 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] disabled:opacity-40 text-white text-sm font-medium"
              >
                {singleSyncing ? "Fetching..." : "Sync Student Now"}
              </button>
            </div>
            {singleSyncMsg && <p className="text-xs font-mono text-[#15966A]">{singleSyncMsg}</p>}
          </form>

          {/* Batch sync */}
          <div className="p-4 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] space-y-4">
            <div>
              <div className="text-sm font-semibold text-[#201f20]">Batch Background Sync</div>
              <p className="text-xs text-[#606060] mt-0.5">
                LeetCode uses a 2s delay + circuit breaker on 429/403. Optional{" "}
                <code className="font-mono text-[#201f20]">GITHUB_TOKEN</code> in{" "}
                <code className="font-mono text-[#201f20]">backend/.env</code> boosts GitHub to 5,000 req/hr.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                value={batchFilter}
                onChange={(e) => setBatchFilter(e.target.value)}
                className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-sm text-[#201f20]"
              >
                <option value="ALL">All Batches</option>
                <option value="II Year">II Year</option>
                <option value="III Year">III Year</option>
                <option value="IV Year">IV Year</option>
              </select>
              <select
                value={batchPlatform}
                onChange={(e) => setBatchPlatform(e.target.value)}
                className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-sm text-[#201f20]"
              >
                <option value="both">GitHub + LeetCode</option>
                <option value="github">GitHub Only</option>
                <option value="leetcode">LeetCode Only</option>
              </select>
              <input
                type="number"
                min={1}
                max={2071}
                value={batchLimit}
                onChange={(e) => setBatchLimit(Math.max(1, Math.min(2071, Number(e.target.value) || 1)))}
                className="w-24 bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-sm text-[#201f20] font-mono"
                title="Max students in this batch run"
              />
              <label className="inline-flex items-center gap-2 text-xs text-[#201f20]">
                <input
                  type="checkbox"
                  checked={onlyUnverified}
                  onChange={(e) => setOnlyUnverified(e.target.checked)}
                  className="accent-[#2e5bff]"
                />
                Only Unverified / Pending
              </label>

              {!syncStatus?.is_running ? (
                <button
                  type="button"
                  onClick={handleStartBatch}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-white text-sm font-medium"
                >
                  <Play className="w-4 h-4" /> Start Batch Sync
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleStopBatch}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#d93838] hover:bg-[#b92b2b] text-white text-sm font-medium"
                >
                  <Square className="w-4 h-4" /> Stop Sync
                </button>
              )}
            </div>

            {syncStatus && (syncStatus.total_targets > 0 || syncStatus.logs.length > 0) && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-[#494949]">
                  <span>
                    {syncStatus.is_running
                      ? `Syncing: ${syncStatus.current_student || "..."}`
                      : "Batch Sync Idle"}
                  </span>
                  <span>
                    {syncStatus.processed} / {syncStatus.total_targets} ({progressPct}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#e0e0df] overflow-hidden">
                  <div
                    className="h-full bg-[#2e5bff] transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-mono">
                  <span className="text-[#15966A]">GH Verified: {syncStatus.gh_verified}</span>
                  <span className="text-[#d93838]">GH Failed: {syncStatus.gh_failed}</span>
                  <span className="text-[#C58A18]">LC Verified: {syncStatus.lc_verified}</span>
                  <span className="text-[#d93838]">LC Failed: {syncStatus.lc_failed}</span>
                </div>
                {(syncStatus.gh_circuit_open || syncStatus.lc_circuit_open) && (
                  <div className="p-3 rounded-lg bg-[#fdf6e7] border border-[#f5dfb0] text-xs text-[#C58A18] flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#C58A18] shrink-0" />
                    <span>
                      Circuit Breaker Triggered: {syncStatus.circuit_breaker_reason}. Use Bulk CSV Upload below as
                      fallback.
                    </span>
                  </div>
                )}
                {syncStatus.logs.length > 0 && (
                  <pre className="p-3 rounded-lg bg-[#141314] text-[#fcfcfd] border border-[#494949] text-[11px] font-mono max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {syncStatus.logs.join("\n")}
                  </pre>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Unsync / Clear Student Data */}
        <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-6 shadow-sm">
          <div className="flex items-center gap-2.5">
            <RotateCcw className="w-5 h-5 text-[#d93838]" />
            <div>
              <h2 className="text-base font-semibold text-[#201f20]">3. Unsync / Reset Student Data</h2>
              <p className="text-xs text-[#606060]">
                Clears fetched metrics and resets student profiles to unranked / "Data unavailable" without deleting records.
              </p>
            </div>
          </div>

          {unsyncSuccessMsg && (
            <div className="p-3.5 rounded-lg bg-[#e8f5ef] border border-[#bfe5d5] text-xs font-medium text-[#15966A] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#15966A] shrink-0" />
              <span>{unsyncSuccessMsg}</span>
            </div>
          )}

          {unsyncErrorMsg && (
            <div className="p-3.5 rounded-lg bg-[#fdeeee] border border-[#fad0d0] text-xs font-medium text-[#d93838] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-[#d93838] shrink-0" />
              <span>{unsyncErrorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Option A: Specific Roll Numbers */}
            <form onSubmit={handleUnsyncRolls} className="p-4 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] space-y-3">
              <div className="text-sm font-semibold text-[#201f20]">Option A: Unsync Specific Student(s)</div>
              <p className="text-xs text-[#606060]">
                Enter a single roll number or comma-separated list (e.g. <code className="font-mono text-[#201f20]">25B11CS001, 25B11CS002</code>).
              </p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={unsyncRoll}
                  onChange={(e) => setUnsyncRoll(e.target.value)}
                  placeholder="Roll number(s), comma-separated"
                  className="w-full bg-[#ffffff] border border-[#e0e0df] rounded-full px-4 py-2 text-sm text-[#201f20] font-mono outline-none focus:border-[#d93838]"
                />
                <div className="flex items-center gap-3">
                  <select
                    value={unsyncPlatform}
                    onChange={(e) => setUnsyncPlatform(e.target.value)}
                    className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-xs text-[#201f20]"
                  >
                    <option value="all">All Platforms</option>
                    <option value="leetcode">LeetCode Only</option>
                    <option value="github">GitHub Only</option>
                  </select>
                  <button
                    type="submit"
                    disabled={unsyncLoading || !unsyncRoll.trim()}
                    className="px-4 py-1.5 rounded-full bg-[#d93838] hover:bg-[#b92b2b] disabled:opacity-40 text-white text-xs font-medium transition-colors"
                  >
                    {unsyncLoading ? "Unsyncing..." : "Unsync Student(s)"}
                  </button>
                </div>
              </div>
            </form>

            {/* Option B: Entire Batch */}
            <div className="p-4 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] space-y-3">
              <div className="text-sm font-semibold text-[#201f20]">Option B: Unsync Entire Cohort / Batch</div>
              <p className="text-xs text-[#606060]">
                Reset all fetched data for an entire cohort. Prompts for confirmation before executing.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <select
                  value={unsyncBatch}
                  onChange={(e) => setUnsyncBatch(e.target.value)}
                  className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-xs text-[#201f20]"
                >
                  <option value="II Year">II Year</option>
                  <option value="III Year">III Year</option>
                  <option value="IV Year">IV Year</option>
                </select>
                <select
                  value={unsyncPlatform}
                  onChange={(e) => setUnsyncPlatform(e.target.value)}
                  className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-xs text-[#201f20]"
                >
                  <option value="all">All Platforms</option>
                  <option value="leetcode">LeetCode Only</option>
                  <option value="github">GitHub Only</option>
                </select>
                <button
                  type="button"
                  disabled={unsyncLoading}
                  onClick={handleUnsyncBatch}
                  className="px-4 py-1.5 rounded-full bg-[#d93838] hover:bg-[#b92b2b] disabled:opacity-40 text-white text-xs font-medium transition-colors"
                >
                  {unsyncLoading ? "Unsyncing..." : `Unsync Entire ${unsyncBatch}`}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Section 4 & 5: Bulk CSV Upload + Ranking Weights */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Upload className="w-5 h-5 text-[#C58A18]" />
                <h2 className="text-base font-semibold text-[#201f20]">4. Bulk CSV Metrics Fallback</h2>
              </div>
              <button
                type="button"
                onClick={handleDownloadSampleCsv}
                className="inline-flex items-center gap-1.5 text-xs text-[#2e5bff] hover:underline"
              >
                <Download className="w-3.5 h-3.5" /> Template CSV
              </button>
            </div>

            <form onSubmit={handleCsvUpload} className="space-y-3">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-xs text-[#494949] file:mr-3 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:bg-[#f7f6f6] file:text-[#201f20]"
              />
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={SAMPLE_CSV}
                className="w-full bg-[#f7f6f6] border border-[#e0e0df] rounded-lg p-3 text-xs font-mono text-[#201f20] placeholder-[#606060] outline-none focus:border-[#2e5bff]"
              />
              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={csvLoading || (!csvFile && !csvText.trim())}
                  className="px-5 py-2 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] disabled:opacity-40 text-white font-medium text-sm transition-colors"
                >
                  {csvLoading ? "Importing CSV..." : "Import CSV Metrics"}
                </button>
                <button
                  type="button"
                  onClick={() => setCsvText(SAMPLE_CSV)}
                  className="text-xs text-[#606060] hover:text-[#201f20]"
                >
                  Load example
                </button>
              </div>
              {csvResult && (
                <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] text-xs text-[#15966A]">
                  {csvResult}
                </div>
              )}
            </form>
          </section>

          <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-5 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Sliders className="w-5 h-5 text-[#2e5bff]" />
              <h2 className="text-base font-semibold text-[#201f20]">5. Ranking Weights &amp; Privacy</h2>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[#C58A18] font-medium">LeetCode Weight: {lcWeightPct}%</span>
                  <span className="text-[#2e5bff] font-medium">GitHub Weight: {100 - lcWeightPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={lcWeightPct}
                  onChange={(e) => setLcWeightPct(Number(e.target.value))}
                  className="w-full accent-[#2e5bff]"
                />
                <p className="text-xs text-[#606060]">
                  Default is 60% LeetCode / 40% GitHub. Changing weights recalculates all 2,071 student rankings
                  immediately.
                </p>
              </div>

              <label className="flex items-start gap-3 p-3.5 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] cursor-pointer">
                <input
                  type="checkbox"
                  checked={maskRolls}
                  onChange={(e) => setMaskRolls(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#2e5bff]"
                />
                <div>
                  <div className="text-sm font-medium text-[#201f20]">Mask Middle Digits of Roll Numbers Publicly</div>
                  <div className="text-xs text-[#606060] mt-0.5">
                    Displays e.g. <code className="font-mono">25B****001</code> across public pages while keeping profile
                    routing working.
                  </div>
                </div>
              </label>

              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-white text-sm font-medium transition-colors"
              >
                <CheckCircle2 className="w-4 h-4" /> Save &amp; Recalculate Rankings
              </button>

              {settingsMsg && (
                <div className="p-3 rounded-lg bg-[#e8f5ef] border border-[#bfe5d5] text-xs text-[#15966A]">
                  {settingsMsg}
                </div>
              )}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;

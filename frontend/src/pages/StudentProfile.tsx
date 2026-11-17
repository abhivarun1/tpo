import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Award,
  Clock,
  Code2,
  ExternalLink,
  GitBranch,
  History,
  RefreshCw,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchStudentProfile, syncSingleStudent } from "../api/client";
import { CoverageBadge } from "../components/CoverageBadge";
import { PlatformStatusBadge, RankingStatusBadge } from "../components/StatusBadge";
import type { StudentDetail } from "../types";

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Data unavailable";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Data unavailable";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UnavailableText({ label = "Data unavailable" }: { label?: string }) {
  return <span className="text-sm italic text-[#606060]">{label}</span>;
}

export function StudentProfile() {
  const { rollNumber } = useParams<{ rollNumber: string }>();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!rollNumber) return;
    setLoading(true);
    setError(null);
    fetchStudentProfile(rollNumber)
      .then(setStudent)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [rollNumber]);

  const handleQuickSync = async () => {
    if (!student) return;
    let pw = sessionStorage.getItem("cse_rank_admin_pw") || "";
    if (!pw) {
      const entered = window.prompt("Enter Admin password to trigger live GitHub/LeetCode sync:");
      if (!entered) return;
      pw = entered;
    }
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncSingleStudent(pw, student.roll_number, "both");
      sessionStorage.setItem("cse_rank_admin_pw", pw);
      setStudent(res.student);
      if (res.sync_result.errors.length > 0) {
        setSyncMsg(`Completed with notes: ${res.sync_result.errors.join(" | ")}`);
      } else {
        setSyncMsg("Live profile metrics synced and rankings recalculated.");
      }
    } catch (err) {
      setSyncMsg(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
        <div className="h-40 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-72 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] animate-pulse" />
          <div className="h-72 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center space-y-4">
        <div className="p-8 rounded-lg bg-[#ffffff] border border-[#e0e0df]">
          <h1 className="text-xl font-medium text-[#201f20]">Student Not Found</h1>
          <p className="text-sm text-[#494949] mt-2 mb-6">{error || "Could not find student record."}</p>
          <Link
            to="/leaderboards"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#2e5bff] text-[#fcfcfd] text-sm font-medium hover:bg-[#1e46db] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Leaderboards
          </Link>
        </div>
      </div>
    );
  }

  const comparisonData = [
    {
      metric: "LeetCode Score",
      Student: student.lc_status === "VERIFIED" ? student.lc_score ?? 0 : 0,
      "Batch Avg": student.benchmarks.batch_avg_lc ?? 0,
      "College Avg": student.benchmarks.college_avg_lc ?? 0,
    },
    {
      metric: "GitHub Score",
      Student: student.gh_status === "VERIFIED" ? student.gh_score ?? 0 : 0,
      "Batch Avg": student.benchmarks.batch_avg_gh ?? 0,
      "College Avg": student.benchmarks.college_avg_gh ?? 0,
    },
    {
      metric: "Overall Score",
      Student: student.overall_score ?? 0,
      "Batch Avg": student.benchmarks.batch_avg_overall ?? 0,
      "College Avg": student.benchmarks.college_avg_overall ?? 0,
    },
  ];

  const hasComparisonValues =
    student.lc_status === "VERIFIED" ||
    student.gh_status === "VERIFIED" ||
    student.benchmarks.college_avg_overall !== null;

  const historyData = student.snapshots.map((sn) => ({
    date: new Date(sn.recorded_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    "Overall Score": sn.overall_score,
    "LC Score": sn.lc_score,
    "GH Score": sn.gh_score,
    "LC Solved": sn.lc_total_solved,
  }));

  const lcEasy = student.lc_easy_solved ?? 0;
  const lcMed = student.lc_medium_solved ?? 0;
  const lcHard = student.lc_hard_solved ?? 0;
  const lcDenom = Math.max(1, lcEasy + lcMed + lcHard);

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
        {/* Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/leaderboards"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium bg-[#f7f6f6] border border-[#e0e0df] text-[#494949] hover:text-[#201f20] hover:bg-[#e0e0df] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Leaderboards
          </Link>

          <button
            type="button"
            onClick={handleQuickSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#f7f6f6] hover:bg-[#e0e0df] border border-[#e0e0df] text-[#201f20] text-xs sm:text-sm font-medium transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-[#2e5bff]" : "text-[#2e5bff]"}`} />
            {syncing ? "Syncing Live API..." : "Sync Live Data"}
          </button>
        </div>

        {syncMsg && (
          <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] px-4 py-3 text-xs sm:text-sm text-[#201f20]">
            {syncMsg}
          </div>
        )}

        {/* Header Dossier Card */}
        <section className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-[#f7f6f6] border border-[#e0e0df] text-[#494949] text-xs font-medium">
                  {student.batch}
                </span>
                <CoverageBadge coverage={student.profile_coverage} rankingStatus={student.ranking_status} />
                <RankingStatusBadge status={student.ranking_status} />
              </div>
              <h1 className="text-2xl sm:text-3xl font-medium text-[#201f20] tracking-tight">
                {student.name}
              </h1>
              <p className="text-sm font-mono text-[#606060]">
                Roll Number: <span className="text-[#201f20] font-semibold">{student.display_roll_number}</span>
                {student.excel_link_status ? ` • Sheet Status: ${student.excel_link_status}` : ""}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:gap-4 shrink-0">
              <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-[#606060]">College Rank</div>
                <div className="mt-1 text-xl sm:text-2xl font-bold font-mono text-[#201f20]">
                  {student.overall_college_rank ? `#${student.overall_college_rank}` : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-[#606060]">Batch Rank</div>
                <div className="mt-1 text-xl sm:text-2xl font-bold font-mono text-[#2e5bff]">
                  {student.overall_batch_rank ? `#${student.overall_batch_rank}` : "—"}
                </div>
              </div>
              <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] px-4 py-3 text-center">
                <div className="text-[11px] font-medium uppercase tracking-wider text-[#606060]">Overall Score</div>
                <div className="mt-1 text-xl sm:text-2xl font-bold font-mono text-[#15966A]">
                  {student.overall_score !== null ? student.overall_score.toFixed(2) : "—"}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dedicated LeetCode & GitHub Panels */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LeetCode Panel */}
          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 flex flex-col justify-between space-y-5 shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#fdf6e7] text-[#C58A18] border border-[#f5dfb0]">
                    <Code2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#201f20]">LeetCode Profile</h2>
                    {student.lc_clean_url ? (
                      <a
                        href={student.lc_clean_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-[#2e5bff] hover:underline"
                      >
                        @{student.lc_username} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#606060]">No valid LeetCode link</span>
                    )}
                  </div>
                </div>
                <PlatformStatusBadge status={student.lc_status} />
              </div>

              {student.lc_status === "VERIFIED" ? (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">LC Score</div>
                      <div className="text-lg font-mono font-bold text-[#C58A18]">
                        {student.lc_score?.toFixed(2) ?? "0.00"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">College Rank</div>
                      <div className="text-lg font-mono font-bold text-[#201f20]">
                        {student.lc_college_rank ? `#${student.lc_college_rank}` : "—"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">Batch Rank</div>
                      <div className="text-lg font-mono font-bold text-[#201f20]">
                        {student.lc_batch_rank ? `#${student.lc_batch_rank}` : "—"}
                      </div>
                    </div>
                  </div>

                  {/* Difficulty breakdown */}
                  <div className="p-4 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#494949] font-medium">Solved Problems</span>
                      <span className="font-mono font-bold text-[#201f20]">
                        {student.lc_total_solved ?? 0} total
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-[#e0e0df] overflow-hidden flex">
                      <div
                        className="bg-[#15966A]"
                        style={{ width: `${(lcEasy / lcDenom) * 100}%` }}
                        title={`Easy: ${lcEasy}`}
                      />
                      <div
                        className="bg-[#C58A18]"
                        style={{ width: `${(lcMed / lcDenom) * 100}%` }}
                        title={`Medium: ${lcMed}`}
                      />
                      <div
                        className="bg-[#d93838]"
                        style={{ width: `${(lcHard / lcDenom) * 100}%` }}
                        title={`Hard: ${lcHard}`}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                      <div className="text-[#15966A]">Easy: {lcEasy}</div>
                      <div className="text-[#C58A18] text-center">Medium: {lcMed}</div>
                      <div className="text-[#d93838] text-right">Hard: {lcHard}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] flex items-center justify-between">
                      <span className="text-xs text-[#606060] flex items-center gap-1.5">
                        <Award className="w-3.5 h-3.5 text-[#C58A18]" /> Contest Rating
                      </span>
                      <span className="font-mono font-bold text-[#201f20]">
                        {student.lc_contest_rating ? student.lc_contest_rating.toFixed(1) : "0"}
                      </span>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] flex items-center justify-between">
                      <span className="text-xs text-[#606060]">Contests</span>
                      <span className="font-mono font-bold text-[#201f20]">
                        {student.lc_contests_attended ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 p-6 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] text-center space-y-2">
                  <UnavailableText label="Data unavailable — LeetCode metrics have not been verified" />
                  {student.lc_error_message && (
                    <p className="text-xs text-[#d93838]">Reason: {student.lc_error_message}</p>
                  )}
                  {student.lc_raw_url && (
                    <p className="text-[11px] font-mono text-[#606060] break-all">
                      Raw sheet URL: {student.lc_raw_url}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#e0e0df] flex items-center justify-between text-xs text-[#606060]">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Last updated:
              </span>
              <span className="font-mono">
                {student.lc_status === "VERIFIED" ? formatTimestamp(student.lc_last_updated) : "Data unavailable"}
              </span>
            </div>
          </div>

          {/* GitHub Panel */}
          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 flex flex-col justify-between space-y-5 shadow-sm">
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-[#f0f4ff] text-[#2e5bff] border border-[#d6e0ff]">
                    <GitBranch className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-[#201f20]">GitHub Profile</h2>
                    {student.gh_clean_url ? (
                      <a
                        href={student.gh_clean_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono text-[#2e5bff] hover:underline"
                      >
                        @{student.gh_username} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-[#606060]">No valid GitHub link</span>
                    )}
                  </div>
                </div>
                <PlatformStatusBadge status={student.gh_status} />
              </div>

              {student.gh_status === "VERIFIED" ? (
                <div className="mt-5 space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">GH Score</div>
                      <div className="text-lg font-mono font-bold text-[#2e5bff]">
                        {student.gh_score?.toFixed(2) ?? "0.00"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">College Rank</div>
                      <div className="text-lg font-mono font-bold text-[#201f20]">
                        {student.gh_college_rank ? `#${student.gh_college_rank}` : "—"}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-[11px] text-[#606060]">Batch Rank</div>
                      <div className="text-lg font-mono font-bold text-[#201f20]">
                        {student.gh_batch_rank ? `#${student.gh_batch_rank}` : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-lg font-mono font-bold text-[#201f20]">
                        {student.gh_original_repos ?? 0}
                      </div>
                      <div className="text-[11px] text-[#606060] mt-0.5">Original Repos</div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-lg font-mono font-bold text-[#C58A18] flex items-center justify-center gap-1">
                        <Star className="w-3.5 h-3.5" />
                        {student.gh_total_stars ?? 0}
                      </div>
                      <div className="text-[11px] text-[#606060] mt-0.5">Total Stars</div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-lg font-mono font-bold text-[#15966A]">
                        {student.gh_recent_active_repos_90d ?? 0}
                      </div>
                      <div className="text-[11px] text-[#606060] mt-0.5">Active (90d)</div>
                    </div>
                    <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                      <div className="text-lg font-mono font-bold text-[#201f20] flex items-center justify-center gap-1">
                        <Users className="w-3.5 h-3.5 text-[#606060]" />
                        {student.gh_followers ?? 0}
                      </div>
                      <div className="text-[11px] text-[#606060] mt-0.5">Followers</div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                    <div className="flex items-center justify-between text-xs text-[#606060] mb-2">
                      <span>Top Languages (non-forked)</span>
                      <span className="font-mono text-[#201f20]">
                        {student.gh_public_repos ?? 0} total public repos
                      </span>
                    </div>
                    {student.gh_top_languages.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {student.gh_top_languages.map((lang) => (
                          <span
                            key={lang}
                            className="px-2.5 py-0.5 rounded-full bg-[#ffffff] border border-[#e0e0df] text-[#201f20] text-xs font-mono"
                          >
                            {lang}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs italic text-[#606060]">No languages detected yet</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-6 p-6 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] text-center space-y-2">
                  <UnavailableText label="Data unavailable — GitHub metrics have not been verified" />
                  {student.gh_error_message && (
                    <p className="text-xs text-[#d93838]">Reason: {student.gh_error_message}</p>
                  )}
                  {student.gh_raw_url && (
                    <p className="text-[11px] font-mono text-[#606060] break-all">
                      Raw sheet URL: {student.gh_raw_url}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-[#e0e0df] flex items-center justify-between text-xs text-[#606060]">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Last updated:
              </span>
              <span className="font-mono">
                {student.gh_status === "VERIFIED" ? formatTimestamp(student.gh_last_updated) : "Data unavailable"}
              </span>
            </div>
          </div>
        </section>

        {/* Recharts Comparison & History */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-[#2e5bff]" />
              <h2 className="text-sm font-semibold text-[#201f20]">Score vs Batch &amp; College Benchmarks</h2>
            </div>
            {!hasComparisonValues ? (
              <div className="h-64 flex items-center justify-center text-sm italic text-[#606060]">
                Data unavailable — benchmark charts appear once profiles are verified.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparisonData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0df" />
                    <XAxis dataKey="metric" stroke="#606060" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#606060" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e0e0df",
                        borderRadius: "8px",
                        color: "#201f20",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="Student" fill="#2e5bff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Batch Avg" fill="#C58A18" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="College Avg" fill="#a0a0a0" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <History className="w-4 h-4 text-[#C58A18]" />
              <h2 className="text-sm font-semibold text-[#201f20]">Progress Snapshot History</h2>
            </div>
            {historyData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-sm italic text-[#606060] text-center px-4">
                No historical snapshots recorded yet. Snapshots are automatically saved whenever metrics update.
              </div>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={historyData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0df" />
                    <XAxis dataKey="date" stroke="#606060" fontSize={12} />
                    <YAxis domain={[0, 100]} stroke="#606060" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        borderColor: "#e0e0df",
                        borderRadius: "8px",
                        color: "#201f20",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="Overall Score" stroke="#2e5bff" strokeWidth={2.5} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="LC Score" stroke="#C58A18" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="GH Score" stroke="#15966A" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default StudentProfile;

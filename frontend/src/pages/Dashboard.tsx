import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Code2,
  GitBranch,
  Search,
  ShieldAlert,
  Sparkles,
  Trophy,
} from "lucide-react";
import { fetchDashboardSummary, searchStudents } from "../api/client";
import { BrandLogo } from "../components/BrandLogo";
import { CoverageBadge } from "../components/CoverageBadge";
import type { DashboardSummary, StudentSummary } from "../types";
import { formatShortIST } from "../utils/formatDate";

export function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [heroQuery, setHeroQuery] = useState("");
  const [heroResults, setHeroResults] = useState<StudentSummary[]>([]);
  const [heroLoading, setHeroLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = heroQuery.trim();
    if (!q) {
      setHeroResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setHeroLoading(true);
      try {
        const res = await searchStudents(q, 6);
        setHeroResults(res);
      } catch {
        setHeroResults([]);
      } finally {
        setHeroLoading(false);
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [heroQuery]);

  if (loading) {
    return (
      <div className="max-w-[1200px] mx-auto px-6 py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
          <div className="space-y-4">
            <div className="h-4 w-40 bg-[#f7f6f6] rounded-full" />
            <div className="h-12 w-3/4 bg-[#f7f6f6] rounded-lg" />
            <div className="h-6 w-full bg-[#f7f6f6] rounded-lg" />
            <div className="h-12 w-full bg-[#f7f6f6] rounded-full mt-6" />
          </div>
          <div className="h-96 bg-[#f7f6f6] rounded-lg border border-[#e0e0df]" />
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="p-8 rounded-xl bg-[#ffffff] border border-[#e0e0df]">
          <ShieldAlert className="w-8 h-8 text-[#d93838] mx-auto mb-3" />
          <p className="font-medium text-[#201f20] text-lg">Unable to load Teddy Ranks data</p>
          <p className="text-sm text-[#494949] mt-2 mb-5">{error || "Backend API unavailable"}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-full bg-[#2e5bff] text-white text-sm font-medium hover:bg-[#1e46db] transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const topStudents = summary.top_overall?.slice(0, 5) || [];

  return (
    <div className="min-h-screen bg-[#ffffff]">
      {/* Container */}
      <div className="max-w-[1200px] mx-auto px-6 pt-12 pb-16 space-y-16 lg:space-y-20">
        {/* ========================================================================= */}
        {/* 1. SPLIT EDITORIAL HERO SECTION */}
        {/* ========================================================================= */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Column: Headlines, Instant Search, Actions & 4-Metric Key Numbers */}
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f7f6f6] border border-[#e0e0df] text-[#2e5bff] text-xs font-semibold tracking-wider uppercase">
              <Sparkles className="w-3.5 h-3.5 text-[#2e5bff]" />
              <span>College-Wide CSE Coding Leaderboard</span>
            </div>

            <h1 className="text-[36px] sm:text-[46px] lg:text-[48px] text-[#201f20] font-medium leading-[1.12] tracking-tight">
              Transparent Coding Rankings for 2,071 CSE Students.
            </h1>

            <p className="text-base text-[#494949] leading-relaxed max-w-xl">
              Unified, percentile-normalized standings combining LeetCode problem-solving and contest
              performance ({Math.round(summary.leetcode_weight * 100)}%) with original GitHub engineering activity (
              {Math.round(summary.github_weight * 100)}%).
            </p>

            {/* Prominent Pill Search Bar with Dropdown */}
            <div className="relative max-w-xl">
              <div className="relative">
                <Search className="w-4 h-4 text-[#606060] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={heroQuery}
                  onChange={(e) => setHeroQuery(e.target.value)}
                  placeholder="Look up student by name or roll number (e.g. 25B11CS001)..."
                  className="w-full bg-[#f7f6f6] border border-[#e0e0df] focus:border-[#2e5bff] focus:bg-[#ffffff] focus:ring-1 focus:ring-[#2e5bff]/20 rounded-full pl-11 pr-5 py-3.5 text-sm text-[#201f20] placeholder-[#606060] outline-none transition-all shadow-none"
                />
              </div>

              {heroQuery.trim() && (
                <div className="absolute left-0 right-0 mt-2 rounded-xl bg-[#ffffff] border border-[#e0e0df] shadow-lg overflow-hidden z-30">
                  {heroLoading ? (
                    <div className="px-5 py-4 text-xs text-[#606060]">Searching students...</div>
                  ) : heroResults.length === 0 ? (
                    <div className="px-5 py-4 text-xs text-[#606060]">
                      No student record matching "{heroQuery}"
                    </div>
                  ) : (
                    <ul className="divide-y divide-[#e0e0df] max-h-72 overflow-y-auto">
                      {heroResults.map((s) => (
                        <li key={s.roll_number}>
                          <button
                            type="button"
                            onClick={() => navigate(`/student/${encodeURIComponent(s.roll_number)}`)}
                            className="w-full px-5 py-3 text-left hover:bg-[#f7f6f6] flex items-center justify-between gap-3 transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-[#201f20] truncate">{s.name}</div>
                              <div className="text-xs text-[#606060] font-mono mt-0.5">
                                {s.display_roll_number} • {s.batch}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <CoverageBadge coverage={s.profile_coverage} rankingStatus={s.ranking_status} />
                              <span className="text-xs font-mono font-medium text-[#2e5bff]">
                                {s.overall_college_rank ? `#${s.overall_college_rank}` : "Unranked"}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 text-[#606060]" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/leaderboards"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-[#fcfcfd] text-sm font-medium transition-colors"
              >
                Explore Leaderboards
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/methodology"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#f7f6f6] hover:bg-[#e0e0df] text-[#201f20] border border-[#e0e0df] text-sm font-medium transition-colors"
              >
                How Scoring Works
              </Link>
            </div>

            {/* Clean 4-Metric Key Numbers Strip (Separated by thin vertical hairlines) */}
            <div className="pt-4 border-t border-[#e0e0df]">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0">
                <div className="sm:pr-4 sm:border-r sm:border-[#e0e0df]">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#606060] block">
                    Total Students
                  </span>
                  <div className="text-2xl font-bold font-mono text-[#201f20] mt-1">
                    {summary.total_students.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-[#606060] mt-0.5 block">100% records kept</span>
                </div>

                <div className="sm:px-4 sm:border-r sm:border-[#e0e0df]">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#606060] block">
                    Verified Profiles
                  </span>
                  <div className="text-2xl font-bold font-mono text-[#15966A] mt-1">
                    {summary.verified_profiles_count.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-[#606060] mt-0.5 block">Confirmed &amp; Provisional</span>
                </div>

                <div className="sm:px-4 sm:border-r sm:border-[#e0e0df]">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#606060] block">
                    Incomplete / Unv.
                  </span>
                  <div className="text-2xl font-bold font-mono text-[#C58A18] mt-1">
                    {summary.incomplete_unverified_count.toLocaleString()}
                  </div>
                  <span className="text-[11px] text-[#606060] mt-0.5 block">Audit flagged</span>
                </div>

                <div className="sm:pl-4">
                  <span className="text-[11px] font-medium uppercase tracking-wider text-[#606060] block">
                    Last Data Sync
                  </span>
                  <div className="text-sm font-semibold text-[#201f20] mt-2 truncate">
                    {formatShortIST(summary.last_sync || summary.last_sync_at)}
                  </div>
                  <span className="text-[11px] text-[#606060] mt-0.5 block">Automated poll</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Framed Product Preview (Live Top Standings Browser Window) */}
          <div className="lg:col-span-5">
            <div className="rounded-lg border border-[#e0e0df] bg-[#ffffff] overflow-hidden shadow-sm">
              {/* Window Top Bar */}
              <div className="bg-[#f7f6f6] border-b border-[#e0e0df] px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#e0e0df]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#e0e0df]" />
                  <div className="w-2.5 h-2.5 rounded-full bg-[#e0e0df]" />
                </div>
                <div className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3 py-0.5 text-[11px] font-mono text-[#606060] truncate max-w-[200px]">
                  cserank.edu/leaderboards
                </div>
                <div className="w-10" />
              </div>

              {/* Window Body: Top 5 Live Standings */}
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#e0e0df]">
                  <span className="text-xs font-semibold text-[#201f20] uppercase tracking-wider flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-[#2e5bff]" />
                    Top 5 Overall CSE Standings
                  </span>
                  <span className="text-[11px] font-mono text-[#606060]">Percentile 0–100</span>
                </div>

                {topStudents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#606060]">No ranked student data available.</div>
                ) : (
                  <div className="divide-y divide-[#e0e0df]">
                    {topStudents.map((s, idx) => (
                      <Link
                        key={s.roll_number}
                        to={`/student/${encodeURIComponent(s.roll_number)}`}
                        className="py-2.5 flex items-center justify-between gap-3 hover:bg-[#f7f6f6] px-2 rounded-md transition-colors group"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold shrink-0 ${
                              idx === 0
                                ? "bg-[#fef9c3] text-[#854d0e] border border-[#fef08a]"
                                : idx === 1
                                ? "bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0]"
                                : idx === 2
                                ? "bg-[#ffedd5] text-[#9a3412] border border-[#fed7aa]"
                                : "bg-[#f7f6f6] text-[#494949] border border-[#e0e0df]"
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[#201f20] group-hover:text-[#2e5bff] transition-colors truncate">
                              {s.name}
                            </div>
                            <div className="text-[11px] font-mono text-[#606060]">
                              {s.display_roll_number} • {s.batch}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-sm font-mono font-semibold text-[#201f20]">
                            {s.overall_score !== null ? s.overall_score.toFixed(1) : "—"}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#606060] group-hover:text-[#2e5bff] transition-colors" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3 border-t border-[#e0e0df] text-center">
                  <Link
                    to="/leaderboards"
                    className="text-xs font-medium text-[#2e5bff] hover:underline inline-flex items-center gap-1"
                  >
                    View all 2,071 students on full leaderboards
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 2. PLATFORMS & COHORTS STRIP */}
        {/* ========================================================================= */}
        <section className="bg-[#f7f6f6] border border-[#e0e0df] rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-xs font-semibold text-[#201f20] uppercase tracking-wider">
                Ranked Platforms:
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ffffff] border border-[#e0e0df] text-xs font-medium text-[#201f20]">
                  <Code2 className="w-3.5 h-3.5 text-[#C58A18]" />
                  LeetCode
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ffffff] border border-[#e0e0df] text-xs font-medium text-[#201f20]">
                  <GitBranch className="w-3.5 h-3.5 text-[#2e5bff]" />
                  GitHub
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-[#606060]">Active Cohorts:</span>
              <span className="px-2.5 py-1 rounded-full bg-[#ffffff] border border-[#e0e0df] text-xs font-mono font-medium text-[#201f20]">
                II Year • 1,223
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[#ffffff] border border-[#e0e0df] text-xs font-mono font-medium text-[#201f20]">
                III Year • 629
              </span>
              <span className="px-2.5 py-1 rounded-full bg-[#ffffff] border border-[#e0e0df] text-xs font-mono font-medium text-[#201f20]">
                IV Year • 219
              </span>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 3. HOW TEDDY RANKS WORKS (3 CONNECTED STEPS) */}
        {/* ========================================================================= */}
        <section className="space-y-6">
          <div className="max-w-xl">
            <span className="text-xs font-semibold text-[#2e5bff] uppercase tracking-wider block mb-1">
              Methodology &amp; Standards
            </span>
            <h2 className="text-2xl sm:text-3xl font-medium text-[#201f20] tracking-tight">
              How Teddy Ranks Evaluates Performance
            </h2>
            <p className="text-sm text-[#494949] mt-1">
              Fair scoring, validated student profiles, and balanced percentile evaluation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-[#e0e0df] bg-[#ffffff] p-6 space-y-3">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#2e5bff] text-[#fcfcfd] font-mono text-xs font-bold">
                01
              </div>
              <h3 className="text-base font-semibold text-[#201f20]">
                Profile Review &amp; Link Validation
              </h3>
              <p className="text-sm text-[#494949] leading-relaxed">
                All 2,071 students are imported from departmental rosters. Links are sanitized to eliminate
                broken or placeholder URLs and maintain accurate student profiles.
              </p>
            </div>

            <div className="rounded-lg border border-[#e0e0df] bg-[#ffffff] p-6 space-y-3">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#2e5bff] text-[#fcfcfd] font-mono text-xs font-bold">
                02
              </div>
              <h3 className="text-base font-semibold text-[#201f20]">
                Percentile Normalization (0–100)
              </h3>
              <p className="text-sm text-[#494949] leading-relaxed">
                Logarithmic dampening prevents single-metric extremes from distorting overall standings.
                Scores are scaled against department peers (60% LeetCode + 40% GitHub).
              </p>
            </div>

            <div className="rounded-lg border border-[#e0e0df] bg-[#ffffff] p-6 space-y-3">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#2e5bff] text-[#fcfcfd] font-mono text-xs font-bold">
                03
              </div>
              <h3 className="text-base font-semibold text-[#201f20]">
                Fair Missing-Data &amp; Batch Ranks
              </h3>
              <p className="text-sm text-[#494949] leading-relaxed">
                Students with one verified profile receive a Provisional classification. Missing metrics
                clearly show "Data unavailable" instead of inaccurate zero scores.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================================= */}
        {/* 4. CLOSING FULL-WIDTH INVERTED BANNER */}
        {/* ========================================================================= */}
        <section className="rounded-xl bg-[#141314] text-[#fcfcfd] p-8 sm:p-12">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-2xl sm:text-3xl font-medium tracking-tight text-[#fcfcfd]">
                Check your standing across all 2,071 CSE peers
              </h2>
              <p className="text-sm text-[#a0a0a0] leading-relaxed">
                Compare verified metrics with batch averages, track historical growth, or run an on-demand sync for
                your profile.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/leaderboards"
                className="px-6 py-3 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-[#fcfcfd] text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                Open Full Leaderboards
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/admin"
                className="px-6 py-3 rounded-full bg-transparent hover:bg-[#201f20] text-[#fcfcfd] border border-[#494949] text-sm font-medium transition-colors"
              >
                Admin Data Sync
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* 5. CLEAN EDITORIAL FOOTER */}
      {/* ========================================================================= */}
      <footer className="bg-[#f7f6f6] border-t border-[#e0e0df] py-12 mt-12">
        <div className="max-w-[1200px] mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div className="md:col-span-2 space-y-3">
              <div className="flex items-center gap-2.5">
                <BrandLogo className="w-6 h-6 shrink-0" />
                <span className="font-semibold text-base text-[#201f20]">Teddy Ranks</span>
              </div>
              <p className="text-xs text-[#494949] leading-relaxed max-w-md">
                Official coding performance analytics platform for the Department of Computer Science &amp;
                Engineering.
              </p>
              <p className="text-[11px] text-[#606060]">
                Academic Data Note: All student profiles are derived from departmental rosters with public LeetCode
                and GitHub profiles. No personal contact data is collected or exposed.
              </p>
            </div>

            <div>
              <span className="text-xs font-semibold text-[#201f20] uppercase tracking-wider block mb-3">
                Navigation
              </span>
              <ul className="space-y-2 text-xs text-[#494949]">
                <li>
                  <Link to="/" className="hover:text-[#201f20] transition-colors">
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link to="/leaderboards" className="hover:text-[#201f20] transition-colors">
                    Leaderboards
                  </Link>
                </li>
                <li>
                  <Link to="/methodology" className="hover:text-[#201f20] transition-colors">
                    Scoring Methodology
                  </Link>
                </li>
                <li>
                  <Link to="/admin" className="hover:text-[#201f20] transition-colors">
                    Admin Portal
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <span className="text-xs font-semibold text-[#201f20] uppercase tracking-wider block mb-3">
                Cohorts
              </span>
              <ul className="space-y-2 text-xs text-[#494949]">
                <li>
                  <Link to="/leaderboards?tab=II+Year" className="hover:text-[#201f20] transition-colors">
                    II Year (1,223 Students)
                  </Link>
                </li>
                <li>
                  <Link to="/leaderboards?tab=III+Year" className="hover:text-[#201f20] transition-colors">
                    III Year (629 Students)
                  </Link>
                </li>
                <li>
                  <Link to="/leaderboards?tab=IV+Year" className="hover:text-[#201f20] transition-colors">
                    IV Year (219 Students)
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-[#e0e0df] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#606060]">
            <div>Teddy Ranks • Department of Computer Science &amp; Engineering</div>
            <div className="font-mono text-[11px]">2,071 Students</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;

import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { fetchLeaderboard } from "../api/client";
import { CoverageBadge } from "../components/CoverageBadge";
import { PlatformStatusBadge, RankingStatusBadge } from "../components/StatusBadge";
import type { LeaderboardResponse, StudentSummary } from "../types";

const TABS = [
  { id: "overall", label: "Overall College" },
  { id: "II Year", label: "II Year" },
  { id: "III Year", label: "III Year" },
  { id: "IV Year", label: "IV Year" },
  { id: "leetcode", label: "LeetCode" },
  { id: "github", label: "GitHub" },
];

const PLATFORM_OPTIONS = [
  { id: "all", label: "All Platform States" },
  { id: "both", label: "Both Platforms (LeetCode + GitHub • 2/2)" },
  { id: "either", label: "Any 1 or 2 Platforms (LeetCode or GitHub)" },
  { id: "leetcode_only", label: "LeetCode Verified" },
  { id: "github_only", label: "GitHub Verified" },
];

const BATCH_OPTIONS = [
  { id: "all", label: "All Years" },
  { id: "II Year", label: "II Year" },
  { id: "III Year", label: "III Year" },
  { id: "IV Year", label: "IV Year" },
];

export function Leaderboards() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") || "overall";

  const [tab, setTab] = useState(TABS.some((t) => t.id === initialTab) ? initialTab : "overall");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [includeUnranked, setIncludeUnranked] = useState(true);
  const [sortBy, setSortBy] = useState("rank");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Multi-Condition Filter State
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [selectedPlatformCombo, setSelectedPlatformCombo] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftBatch, setDraftBatch] = useState<string>("all");
  const [draftPlatformCombo, setDraftPlatformCombo] = useState<string>("all");
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close filter popover on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    if (filterOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [filterOpen]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const paramTab = searchParams.get("tab");
    if (paramTab && TABS.some((t) => t.id === paramTab) && paramTab !== tab) {
      setTab(paramTab);
      setPage(1);
    }
  }, [searchParams, tab]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchLeaderboard({
      tab,
      batch: selectedBatch,
      platform_combo: selectedPlatformCombo,
      search: debouncedSearch,
      confirmed_only: confirmedOnly,
      include_unranked: includeUnranked,
      sort_by: sortBy,
      sort_dir: sortDir,
      page,
      page_size: pageSize,
    })
      .then((res) => {
        if (active) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    tab,
    selectedBatch,
    selectedPlatformCombo,
    debouncedSearch,
    confirmedOnly,
    includeUnranked,
    sortBy,
    sortDir,
    page,
    pageSize,
  ]);

  const handleTabChange = (nextTab: string) => {
    setTab(nextTab);
    setPage(1);
    setSortBy("rank");
    setSortDir("asc");
    setSearchParams({ tab: nextTab });
  };

  const handleSort = (col: string) => {
    if (sortBy === col) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir(col === "rank" || col === "name" || col === "roll_number" ? "asc" : "desc");
    }
    setPage(1);
  };

  const renderSortIcon = (col: string) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-[#606060]" aria-hidden="true" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#2e5bff]" aria-hidden="true" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#2e5bff]" aria-hidden="true" />
    );
  };

  const getRankBadge = (s: StudentSummary) => {
    let rankNum: number | null = s.overall_college_rank;
    if (tab === "leetcode") rankNum = s.lc_college_rank;
    else if (tab === "github") rankNum = s.gh_college_rank;
    else if (tab === "II Year" || tab === "III Year" || tab === "IV Year") rankNum = s.overall_batch_rank;

    if (rankNum === null) {
      return <span className="text-xs font-mono text-[#606060]">—</span>;
    }
    if (rankNum === 1) {
      return (
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#fef9c3] text-[#854d0e] border border-[#fef08a] font-mono text-xs font-bold">
          #1
        </span>
      );
    }
    if (rankNum === 2) {
      return (
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#f1f5f9] text-[#475569] border border-[#e2e8f0] font-mono text-xs font-bold">
          #2
        </span>
      );
    }
    if (rankNum === 3) {
      return (
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-[#ffedd5] text-[#9a3412] border border-[#fed7aa] font-mono text-xs font-bold">
          #3
        </span>
      );
    }
    return <span className="font-mono font-medium text-[#201f20]">#{rankNum}</span>;
  };

  const isOverallOrBatchTab = tab === "overall" || tab === "II Year" || tab === "III Year" || tab === "IV Year";

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-medium text-[#201f20] tracking-tight flex items-center gap-2.5">
              <Trophy className="w-6 h-6 text-[#2e5bff]" />
              CSE Leaderboards
            </h1>
            <p className="text-sm text-[#494949] mt-1">
              Filter by batch or platform, toggle provisional rankings, and click any student for their full report.
            </p>
          </div>
          {data && (
            <div className="text-xs font-mono px-3.5 py-1.5 rounded-full bg-[#f7f6f6] border border-[#e0e0df] text-[#494949]">
              Showing {data.total.toLocaleString()} student{data.total === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {/* Pill Filter Tabs */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className={`px-4 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-[#2e5bff] text-[#fcfcfd] border border-[#2e5bff]"
                  : "bg-[#f7f6f6] text-[#494949] border border-[#e0e0df] hover:text-[#201f20] hover:bg-[#e0e0df]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters Bar */}
        <div className="rounded-lg bg-[#f7f6f6] border border-[#e0e0df] p-4 space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 max-w-xl">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#606060] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by student name or roll number..."
                  className="w-full bg-[#ffffff] border border-[#e0e0df] focus:border-[#2e5bff] focus:ring-1 focus:ring-[#2e5bff]/20 rounded-full pl-9 pr-3 py-2 text-sm text-[#201f20] placeholder-[#606060] outline-none"
                />
              </div>

              {/* Filter Trigger Button & Dropdown Popover */}
              <div ref={filterPopoverRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setDraftBatch(selectedBatch);
                    setDraftPlatformCombo(selectedPlatformCombo);
                    setFilterOpen(!filterOpen);
                  }}
                  className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full text-xs sm:text-sm font-medium border transition-colors ${
                    (selectedBatch !== "all" || selectedPlatformCombo !== "all")
                      ? "bg-[#2e5bff] text-white border-[#2e5bff] shadow-sm"
                      : "bg-[#ffffff] text-[#201f20] border-[#e0e0df] hover:bg-[#f7f6f6]"
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  <span>Filters</span>
                  {(selectedBatch !== "all" || selectedPlatformCombo !== "all") && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white text-[#2e5bff] text-[11px] font-bold">
                      {(selectedBatch !== "all" ? 1 : 0) + (selectedPlatformCombo !== "all" ? 1 : 0)}
                    </span>
                  )}
                </button>

                {filterOpen && (
                  <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-2 w-80 sm:w-96 rounded-xl bg-[#ffffff] border border-[#e0e0df] shadow-lg p-5 z-40 space-y-5 animate-in fade-in zoom-in-95 duration-100">
                    <div className="flex items-center justify-between border-b border-[#e0e0df] pb-3">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-4 h-4 text-[#2e5bff]" />
                        <h3 className="text-sm font-semibold text-[#201f20]">Multi-Condition Filters</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFilterOpen(false)}
                        className="p-1 text-[#606060] hover:text-[#201f20] rounded-full hover:bg-[#f7f6f6]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* 1. Academic Year */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[#201f20] uppercase tracking-wider block">
                        Academic Year
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {BATCH_OPTIONS.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => setDraftBatch(b.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-colors ${
                              draftBatch === b.id
                                ? "bg-[#2e5bff] text-white border-[#2e5bff]"
                                : "bg-[#f7f6f6] text-[#201f20] border-[#e0e0df] hover:bg-[#e0e0df]"
                            }`}
                          >
                            <span>{b.label}</span>
                            {draftBatch === b.id && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. Platform Combination */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-[#201f20] uppercase tracking-wider block">
                        Platform Selection
                      </label>
                      <div className="space-y-1.5">
                        {PLATFORM_OPTIONS.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setDraftPlatformCombo(p.id)}
                            className={`w-full px-3 py-2 rounded-lg text-xs font-medium border text-left flex items-center justify-between transition-colors ${
                              draftPlatformCombo === p.id
                                ? "bg-[#2e5bff] text-white border-[#2e5bff]"
                                : "bg-[#f7f6f6] text-[#201f20] border-[#e0e0df] hover:bg-[#e0e0df]"
                            }`}
                          >
                            <span className="truncate pr-2">{p.label}</span>
                            {draftPlatformCombo === p.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between pt-3 border-t border-[#e0e0df] gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setDraftBatch("all");
                          setDraftPlatformCombo("all");
                          setSelectedBatch("all");
                          setSelectedPlatformCombo("all");
                          setFilterOpen(false);
                          setPage(1);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-[#494949] hover:text-[#201f20] hover:bg-[#f7f6f6] transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset All
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBatch(draftBatch);
                          setSelectedPlatformCombo(draftPlatformCombo);
                          setFilterOpen(false);
                          setPage(1);
                        }}
                        className="px-4 py-1.5 rounded-full bg-[#2e5bff] hover:bg-[#1e46db] text-white text-xs font-medium shadow-sm transition-colors"
                      >
                        Apply Filters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {isOverallOrBatchTab && (
                <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#201f20] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmedOnly}
                    onChange={(e) => {
                      setConfirmedOnly(e.target.checked);
                      setPage(1);
                    }}
                    className="w-4 h-4 rounded accent-[#2e5bff]"
                  />
                  <span>Confirmed Only (2/2)</span>
                </label>
              )}

              <label className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#201f20] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeUnranked}
                  onChange={(e) => {
                    setIncludeUnranked(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 rounded accent-[#2e5bff]"
                />
                <span>Include Unranked / Pending</span>
              </label>

              <select
                aria-label="Rows per page"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="bg-[#ffffff] border border-[#e0e0df] rounded-full px-3.5 py-1.5 text-xs sm:text-sm text-[#201f20] outline-none"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
          </div>

          {/* Active Filter Chips */}
          {(selectedBatch !== "all" || selectedPlatformCombo !== "all") && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#e0e0df]">
              <span className="text-xs text-[#606060]">Active Filters:</span>
              {selectedBatch !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0f4ff] border border-[#d6e0ff] text-xs font-medium text-[#2e5bff]">
                  Year: {selectedBatch}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBatch("all");
                      setPage(1);
                    }}
                    className="hover:text-[#1e46db]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {selectedPlatformCombo !== "all" && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#f0f4ff] border border-[#d6e0ff] text-xs font-medium text-[#2e5bff]">
                  Platform: {PLATFORM_OPTIONS.find((p) => p.id === selectedPlatformCombo)?.label.split(" (")[0] || selectedPlatformCombo}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlatformCombo("all");
                      setPage(1);
                    }}
                    className="hover:text-[#1e46db]"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setSelectedBatch("all");
                  setSelectedPlatformCombo("all");
                  setPage(1);
                }}
                className="text-xs text-[#606060] hover:text-[#d93838] underline ml-1"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        {/* Table Container */}
        <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] overflow-hidden">
          {error && (
            <div className="p-4 text-sm text-[#d93838] bg-[#fdeeee] border-b border-[#fad0d0]">
              Error loading leaderboard: {error}
            </div>
          )}

          <div tabIndex={0} role="region" aria-label="Teddy Ranks Leaderboard Table" className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[#e0e0df] bg-[#f7f6f6] text-[11px] uppercase tracking-wider text-[#494949]">
                  <th
                    scope="col"
                    className="py-3 px-4"
                    aria-sort={sortBy === "rank" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("rank")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#201f20]"
                    >
                      Rank {renderSortIcon("rank")}
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4"
                    aria-sort={sortBy === "name" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#201f20]"
                    >
                      Student {renderSortIcon("name")}
                    </button>
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Batch
                  </th>
                  <th scope="col" className="py-3 px-4">
                    Coverage &amp; Status
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-right"
                    aria-sort={sortBy === "lc_score" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("lc_score")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#201f20] ml-auto"
                    >
                      LeetCode {renderSortIcon("lc_score")}
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-right"
                    aria-sort={sortBy === "gh_score" ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("gh_score")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#201f20] ml-auto"
                    >
                      GitHub {renderSortIcon("gh_score")}
                    </button>
                  </th>
                  <th
                    scope="col"
                    className="py-3 px-4 text-right"
                    aria-sort={
                      sortBy === "overall_score" ? (sortDir === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    <button
                      type="button"
                      onClick={() => handleSort("overall_score")}
                      className="inline-flex items-center gap-1 font-semibold hover:text-[#201f20] ml-auto"
                    >
                      Overall Score {renderSortIcon("overall_score")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0df] text-sm">
                {loading && !data ? (
                  Array.from({ length: 8 }).map((_, idx) => (
                    <tr key={idx}>
                      <td colSpan={7} className="py-4 px-4">
                        <div className="h-4 bg-[#f7f6f6] rounded animate-pulse" />
                      </td>
                    </tr>
                  ))
                ) : !data || data.items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 px-4 text-center text-[#606060]">
                      No students match the selected filters.
                    </td>
                  </tr>
                ) : (
                  data.items.map((s) => (
                    <tr key={s.roll_number} className="hover:bg-[#f7f6f6] transition-colors">
                      <td className="py-3.5 px-4 whitespace-nowrap">{getRankBadge(s)}</td>
                      <td className="py-3.5 px-4">
                        <Link
                          to={`/student/${encodeURIComponent(s.roll_number)}`}
                          className="font-medium text-[#201f20] hover:text-[#2e5bff] transition-colors block"
                        >
                          {s.name}
                        </Link>
                        <span className="text-xs font-mono text-[#606060]">{s.display_roll_number}</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-[#494949] whitespace-nowrap">{s.batch}</td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <CoverageBadge coverage={s.profile_coverage} rankingStatus={s.ranking_status} />
                          <RankingStatusBadge status={s.ranking_status} />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {s.lc_status === "VERIFIED" && s.lc_score !== null ? (
                          <div>
                            <div className="font-mono font-semibold text-[#C58A18]">
                              {s.lc_score.toFixed(1)}
                            </div>
                            <div className="text-[11px] font-mono text-[#606060]">
                              {s.lc_total_solved ?? 0} solved • {Math.round(s.lc_contest_rating ?? 0)} rt
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs italic text-[#606060]">Data unavailable</span>
                            <PlatformStatusBadge status={s.lc_status} />
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {s.gh_status === "VERIFIED" && s.gh_score !== null ? (
                          <div>
                            <div className="font-mono font-semibold text-[#2e5bff]">
                              {s.gh_score.toFixed(1)}
                            </div>
                            <div className="text-[11px] font-mono text-[#606060]">
                              {s.gh_original_repos ?? 0} orig • {s.gh_total_stars ?? 0} ★
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs italic text-[#606060]">Data unavailable</span>
                            <PlatformStatusBadge status={s.gh_status} />
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        {s.overall_score !== null ? (
                          <span className="font-mono text-base font-bold text-[#201f20]">
                            {s.overall_score.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-xs italic text-[#606060]">Data unavailable</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {data && (
            <div className="px-4 py-3 border-t border-[#e0e0df] bg-[#f7f6f6] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#494949]">
              <div>
                Page <span className="font-mono font-medium text-[#201f20]">{data.page}</span> of{" "}
                <span className="font-mono font-medium text-[#201f20]">{data.total_pages}</span> ({data.total.toLocaleString()}{" "}
                total)
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-[#ffffff] border border-[#e0e0df] hover:bg-[#e0e0df] disabled:opacity-40 disabled:pointer-events-none text-[#201f20] transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  type="button"
                  disabled={page >= data.total_pages}
                  onClick={() => setPage((p) => Math.min(data.total_pages, p + 1))}
                  className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full bg-[#ffffff] border border-[#e0e0df] hover:bg-[#e0e0df] disabled:opacity-40 disabled:pointer-events-none text-[#201f20] transition-colors"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Leaderboards;

import { useEffect, useState } from "react";
import { BookOpen, Calculator, CheckCircle2, Code2, GitBranch, Scale, ShieldCheck } from "lucide-react";
import { fetchDashboardSummary } from "../api/client";
import type { DashboardSummary } from "../types";

export function Methodology() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    fetchDashboardSummary()
      .then(setSummary)
      .catch(() => null);
  }, []);

  const lcPct = summary ? Math.round(summary.leetcode_weight * 100) : 60;
  const ghPct = summary ? Math.round(summary.github_weight * 100) : 40;

  return (
    <div className="min-h-screen bg-[#ffffff]">
      <div className="max-w-[1000px] mx-auto px-6 py-12 space-y-10">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f7f6f6] border border-[#e0e0df] text-[#2e5bff] text-xs font-semibold tracking-wider uppercase">
            <BookOpen className="w-3.5 h-3.5 text-[#2e5bff]" />
            Transparent Ranking Methodology
          </div>
          <h1 className="text-3xl sm:text-4xl font-medium text-[#201f20] tracking-tight">
            How Teddy Ranks Scores &amp; Ranks Students
          </h1>
          <p className="text-[#494949] text-base leading-relaxed">
            Teddy Ranks uses logarithmic dampening and percentile normalization across verified GitHub and LeetCode
            profiles so extreme outliers do not distort scores for the rest of the college, and forked repositories or
            missing links never inflate rankings.
          </p>
        </div>

        {/* Platform Raw Indices */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#fdf6e7] text-[#C58A18] border border-[#f5dfb0]">
                <Code2 className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-[#201f20]">1. LeetCode Raw Index</h2>
            </div>
            <div className="p-3.5 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] font-mono text-xs sm:text-sm text-[#201f20] leading-relaxed overflow-x-auto">
              LC_Raw = 0.60 × ln(1 + (1×Easy + 2.5×Medium + 5×Hard)) + 0.40 × ln(1 + max(0, ContestRating - 1200))
            </div>
            <ul className="text-xs sm:text-sm text-[#494949] space-y-1.5 list-disc list-inside">
              <li>Hard problems carry 5× weight and Medium 2.5× weight relative to Easy.</li>
              <li>Contest ratings above the 1200 baseline reward consistent competitive performance.</li>
              <li>Natural log dampening prevents grinding thousands of Easy problems from dominating.</li>
            </ul>
          </div>

          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-4 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#f0f4ff] text-[#2e5bff] border border-[#d6e0ff]">
                <GitBranch className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-[#201f20]">2. GitHub Raw Index (Anti-Gaming)</h2>
            </div>
            <div className="p-3.5 rounded-lg bg-[#f7f6f6] border border-[#e0e0df] font-mono text-xs sm:text-sm text-[#201f20] leading-relaxed overflow-x-auto">
              GH_Raw = 3.0×ln(1+Stars) + 2.5×ln(1+OriginalRepos) + 2.0×RecentActive90d + 1.5×DistinctLanguages + 1.0×ln(1+Followers)
            </div>
            <ul className="text-xs sm:text-sm text-[#494949] space-y-1.5 list-disc list-inside">
              <li>
                <strong>Forked repositories are strictly excluded</strong> from Original Repos, Stars, Languages, and
                90-day activity.
              </li>
              <li>Rewards recent shipping activity (repos pushed within the last 90 days) and breadth of languages.</li>
            </ul>
          </div>
        </div>

        {/* Percentile Normalization & Combined Weights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#e8f5ef] text-[#15966A] border border-[#bfe5d5]">
                <Calculator className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-[#201f20]">3. 0–100 Percentile Normalization</h2>
            </div>
            <p className="text-sm text-[#494949] leading-relaxed">
              Each platform&apos;s Raw Index is converted into a <strong>0–100 percentile score</strong> across all
              students who have verified data on that platform. A verified account with zero activity scores{" "}
              <code className="font-mono text-[#201f20] px-1 py-0.5 bg-[#f7f6f6] border border-[#e0e0df] rounded">
                0.0
              </code>
              , while top performers approach{" "}
              <code className="font-mono text-[#201f20] px-1 py-0.5 bg-[#f7f6f6] border border-[#e0e0df] rounded">
                100.0
              </code>
              .
            </p>
          </div>

          <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#fdf6e7] text-[#C58A18] border border-[#f5dfb0]">
                <Scale className="w-5 h-5" />
              </div>
              <h2 className="text-base font-semibold text-[#201f20]">
                4. Combined Score ({lcPct}% LC / {ghPct}% GH)
              </h2>
            </div>
            <div className="space-y-2 text-sm text-[#494949]">
              <div className="p-3 rounded-lg bg-[#e8f5ef] border border-[#bfe5d5]">
                <span className="font-semibold text-[#15966A]">2/2 CONFIRMED:</span>{" "}
                <span className="font-mono text-xs text-[#201f20]">
                  Overall = {(lcPct / 100).toFixed(2)} × LC_Score + {(ghPct / 100).toFixed(2)} × GH_Score
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#fdf6e7] border border-[#f5dfb0]">
                <span className="font-semibold text-[#C58A18]">1/2 PROVISIONAL:</span>{" "}
                <span className="font-mono text-xs text-[#201f20]">
                  Overall = 0.85 × Available_Platform_Score
                </span>{" "}
                (ranked after Confirmed students by default)
              </div>
              <div className="p-3 rounded-lg bg-[#f7f6f6] border border-[#e0e0df]">
                <span className="font-semibold text-[#606060]">0/2 UNRANKED:</span> Searchable in directory; displays{" "}
                <span className="italic">&quot;Data unavailable&quot;</span> instead of zero.
              </div>
            </div>
          </div>
        </div>

        {/* 6 Stored Ranks & Honest Data States */}
        <div className="rounded-lg bg-[#ffffff] border border-[#e0e0df] p-6 space-y-4 shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#f0f4ff] text-[#2e5bff] border border-[#d6e0ff]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h2 className="text-base font-semibold text-[#201f20]">
              5. Honest Data States, URL Cleaning &amp; 6 Stored Ranks
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-[#494949]">
            <div className="space-y-2">
              <h3 className="font-medium text-[#201f20]">Every student stores 6 independent ranks:</h3>
              <ul className="space-y-1.5 text-xs sm:text-sm text-[#494949]">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#15966A] shrink-0" /> Overall College Rank &amp; Overall Batch Rank
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#C58A18] shrink-0" /> LeetCode College Rank &amp; LeetCode Batch Rank
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2e5bff] shrink-0" /> GitHub College Rank &amp; GitHub Batch Rank
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <h3 className="font-medium text-[#201f20]">Dataset Hygiene &amp; Honest States:</h3>
              <p className="text-xs sm:text-sm text-[#494949] leading-relaxed">
                Generic links like{" "}
                <code className="font-mono text-[#d93838] px-1 py-0.5 bg-[#fdeeee] rounded">/problemset</code>,{" "}
                <code className="font-mono text-[#d93838] px-1 py-0.5 bg-[#fdeeee] rounded">/signup</code>,{" "}
                <code className="font-mono text-[#d93838] px-1 py-0.5 bg-[#fdeeee] rounded">/dashboard</code>, wrong
                websites, or GitHub repository URLs are automatically flagged as{" "}
                <code className="font-mono text-[#d93838] px-1 py-0.5 bg-[#fdeeee] rounded">INVALID_URL</code>.
                CodeChef links are ignored completely. Only{" "}
                <code className="font-mono text-[#15966A] px-1 py-0.5 bg-[#e8f5ef] rounded">VERIFIED</code> profiles
                display numeric scores.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Methodology;

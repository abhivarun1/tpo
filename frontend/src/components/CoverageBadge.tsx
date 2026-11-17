import type { RankingStatus } from "../types";

export function CoverageBadge({
  coverage,
  rankingStatus,
}: {
  coverage: string;
  rankingStatus?: RankingStatus;
}) {
  let color = "bg-[#f7f6f6] text-[#606060] border-[#e0e0df]";
  if (coverage === "2/2") {
    color = "bg-[#e8f5ef] text-[#15966A] border-[#bfe5d5]";
  } else if (coverage === "1/2") {
    color = "bg-[#fdf6e7] text-[#C58A18] border-[#f5dfb0]";
  }

  return (
    <span
      title={rankingStatus ? `Status: ${rankingStatus}` : undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-medium border ${color}`}
    >
      {coverage}
    </span>
  );
}

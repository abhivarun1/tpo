import type { PlatformStatus, RankingStatus } from "../types";

export function PlatformStatusBadge({ status }: { status: PlatformStatus }) {
  const styles: Record<PlatformStatus, string> = {
    VERIFIED: "bg-[#e8f5ef] text-[#15966A] border-[#bfe5d5]",
    PENDING: "bg-[#fdf6e7] text-[#C58A18] border-[#f5dfb0]",
    INVALID_URL: "bg-[#fdeeee] text-[#d93838] border-[#fad0d0]",
    MISSING: "bg-[#f7f6f6] text-[#606060] border-[#e0e0df]",
    FETCH_FAILED: "bg-[#fef3eb] text-[#d97706] border-[#fcd34d]",
  };

  const labels: Record<PlatformStatus, string> = {
    VERIFIED: "Verified",
    PENDING: "Pending Sync",
    INVALID_URL: "Invalid URL",
    MISSING: "Missing URL",
    FETCH_FAILED: "Fetch Failed",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

export function RankingStatusBadge({ status }: { status: RankingStatus }) {
  const styles: Record<RankingStatus, string> = {
    CONFIRMED: "bg-[#e8f5ef] text-[#15966A] border-[#bfe5d5]",
    PROVISIONAL: "bg-[#fdf6e7] text-[#C58A18] border-[#f5dfb0]",
    UNRANKED: "bg-[#f7f6f6] text-[#606060] border-[#e0e0df]",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

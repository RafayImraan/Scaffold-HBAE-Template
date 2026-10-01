import type { Chain } from "viem";

export const COMMITTEE_STATUSES = ["Open", "Active", "Completed"] as const;

export type CommitteeStatusLabel = (typeof COMMITTEE_STATUSES)[number];

export function statusLabel(status: bigint | number | undefined): CommitteeStatusLabel {
  return COMMITTEE_STATUSES[Number(status ?? 0)] ?? "Open";
}

/** 1e-6 USD (e.g. 20_000_000) as a dollar string: $20 / $20.50. */
export function formatUsdE6(usdE6: bigint): string {
  return formatUsdScaled(usdE6, 1_000_000n);
}

/** 1e-18 USD (e.g. price x amount) as a dollar string. */
export function formatUsdE18(usdE18: bigint): string {
  return formatUsdScaled(usdE18, 10n ** 18n);
}

function formatUsdScaled(amount: bigint, scale: bigint): string {
  const cents = Number((amount * 100n) / scale) / 100;
  return `$${cents.toFixed(2)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds % 3600 === 0) {
    const hours = seconds / 3600;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (seconds % 60 === 0) {
    const minutes = seconds / 60;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  return `${seconds} seconds`;
}

export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "0s";
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = secondsLeft % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatAge(secondsAgo: number): string {
  if (secondsAgo < 0) return "just now";
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

/** Hashscan link for a contract address (Hedera chains only). */
export function hashscanContractLink(chain: Chain, address: string): string | undefined {
  const base = chain.blockExplorers?.default.url;
  if (!base) return undefined;
  return `${base}/contract/${address}`;
}

/** Hashscan link for an HCS topic (Hedera chains only). */
export function hashscanTopicLink(chain: Chain, topicId: string): string | undefined {
  const base = chain.blockExplorers?.default.url;
  if (!base) return undefined;
  return `${base}/topic/${topicId}`;
}

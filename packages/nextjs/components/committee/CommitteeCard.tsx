"use client";

import Link from "next/link";
import type { Address } from "viem";
import { useCommitteeReads } from "~~/hooks/committee/useCommittee";
import { formatDuration, formatUsdE6, statusLabel } from "~~/utils/committee";

const STATUS_BADGE: Record<string, string> = {
  Open: "badge-info",
  Active: "badge-success",
  Completed: "badge-ghost",
};

/** Compact row for the home-page registry; the whole row links to the detail page. */
export const CommitteeCard = ({ committee }: { committee: Address }) => {
  const reads = useCommitteeReads(committee, undefined);
  const { status, round, maxMembers, usdAmountPerRound, roundDuration, members } = reads;

  if (status === undefined || usdAmountPerRound === undefined || maxMembers === undefined) {
    return <div className="h-20 rounded-xl bg-base-200 animate-pulse" aria-hidden />;
  }

  const label = statusLabel(status);

  return (
    <Link
      href={`/committee/${committee}`}
      className="flex flex-col gap-2 rounded-xl border border-base-300 bg-base-100 p-4 hover:border-primary transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`badge ${STATUS_BADGE[label]}`}>{label}</span>
        <span className="font-mono text-xs text-base-content/60">
          {committee.slice(0, 6)}...{committee.slice(-4)}
        </span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-lg font-semibold">{formatUsdE6(usdAmountPerRound)} / round</span>
        <span className="text-sm text-base-content/70">
          {members ? `${members.length}/${maxMembers} members` : `up to ${maxMembers} members`}
        </span>
        <span className="text-sm text-base-content/70">
          {label === "Active" && round ? `round ${round}` : formatDuration(Number(roundDuration ?? 0n))} rounds
        </span>
      </div>
    </Link>
  );
};

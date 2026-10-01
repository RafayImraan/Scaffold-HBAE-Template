"use client";

import { CommitteeCard } from "./CommitteeCard";
import type { Address } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-hbar";

/** Registry of every committee the factory has created on the target network. */
export const CommitteeList = () => {
  const { data, isLoading, error } = useScaffoldReadContract({
    contractName: "CommitteeFactory",
    functionName: "getCommittees",
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <div className="h-6 w-40 rounded bg-base-200 animate-pulse" aria-hidden />
        <div className="h-20 rounded-xl bg-base-200 animate-pulse" aria-hidden />
        <div className="h-20 rounded-xl bg-base-200 animate-pulse" aria-hidden />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="alert">
        <span>
          Committee registry unavailable. Deploy the contracts for this network (
          <code className="text-xs">npm run hardhat:deploy</code>).
        </span>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-base-300 p-8 text-center text-base-content/60">
        No committees yet - create the first one.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map(committee => (
        <CommitteeCard key={committee} committee={committee as Address} />
      ))}
    </div>
  );
};

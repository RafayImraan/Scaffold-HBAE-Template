"use client";

import { useMemo } from "react";
import { keccak256, toHex } from "viem";
import { useReadContract } from "wagmi";
import { useNow } from "~~/hooks/committee/useCommittee";
import { useSelectedNetwork } from "~~/hooks/scaffold-hbar";
import { formatAge, formatPriceE18 } from "~~/utils/committee";
import { contracts } from "~~/utils/scaffold-hbar/contract";

/**
 * Live HBAR/USD price from whichever oracle the target network is wired to
 * (Chainlink adapter on Hedera, mock locally). A failed read is shown as a
 * warning: contributions revert while the feed is down - the feed is load-bearing.
 */
export const OraclePriceChip = () => {
  const selectedNetwork = useSelectedNetwork();
  const chainId = selectedNetwork.id;
  const now = useNow(15_000);
  const pairKey = useMemo(() => keccak256(toHex("HBAR/USD")), []);

  const chainContracts = contracts?.[chainId];
  const oracle = chainContracts?.ChainlinkHbarUsdAdapter ?? chainContracts?.MockPriceOracle;

  const { data, error, isLoading } = useReadContract({
    address: oracle?.address,
    abi: oracle?.abi,
    chainId,
    functionName: "latestPrice",
    args: [pairKey],
    query: { enabled: Boolean(oracle), refetchInterval: 30_000 },
  });

  if (!oracle) {
    return <div className="badge badge-ghost badge-lg font-mono text-xs">price feed not deployed on this network</div>;
  }

  const price = error ? undefined : (data as { priceE18: bigint; updatedAt: bigint } | undefined);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-4 py-2 ${
        error ? "border-warning bg-warning/10" : "border-base-300 bg-base-100"
      }`}
      title={`Oracle: ${oracle.address}`}
    >
      <span className="text-sm uppercase tracking-wider text-base-content/60">HBAR/USD</span>
      {error ? (
        <span className="font-semibold text-warning">feed unavailable - contributions blocked</span>
      ) : isLoading && !price ? (
        <span className="h-5 w-24 rounded bg-base-200 animate-pulse" aria-hidden />
      ) : price ? (
        <>
          <span className="font-mono font-semibold">{formatPriceE18(price.priceE18)}</span>
          <span className="text-xs text-base-content/50">{formatAge(now - Number(price.updatedAt))}</span>
        </>
      ) : (
        <span className="font-semibold text-warning">feed unavailable - contributions blocked</span>
      )}
    </div>
  );
};

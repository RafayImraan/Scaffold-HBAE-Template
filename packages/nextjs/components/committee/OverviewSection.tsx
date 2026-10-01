"use client";

import { useState } from "react";
import { BaseInput } from "@scaffold-hbar-ui/components";
import { type Address, formatEther, parseEther } from "viem";
import { useAccount, useBalance } from "wagmi";
import { type CommitteeReads, useCommitteeWrite, useNow } from "~~/hooks/committee/useCommittee";
import { useScaffoldReadContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { formatCountdown, formatUsdE18, hashscanContractLink, statusLabel } from "~~/utils/committee";
import { nativeToDisplayWei } from "~~/utils/hbarUnits";

type Props = {
  committee: Address;
  reads: CommitteeReads;
  writes: ReturnType<typeof useCommitteeWrite>;
};

/** Round clock, pot, HSS schedule state and the HSS fee reserve (top-up/sweep). */
export const OverviewSection = ({ committee, reads, writes }: Props) => {
  const { targetNetwork } = useTargetNetwork();
  const { address: account } = useAccount();
  const now = useNow();
  const [topUp, setTopUp] = useState("");

  const { data: balance } = useBalance({ address: committee, chainId: targetNetwork.id });
  const { data: minReserve } = useScaffoldReadContract({
    contractName: "CommitteeFactory",
    functionName: "minReserve",
  });
  const { data: unitsPerHbar } = useScaffoldReadContract({
    contractName: "CommitteeFactory",
    functionName: "unitsPerHbar",
  });

  const {
    status,
    round,
    roundEndsAt,
    pot,
    contributorsThisRound,
    maxMembers,
    usdAmountPerRound,
    unitsPerHbar: chainUnits,
    quotePriceE18,
    creator,
    pendingSchedule,
  } = reads;

  const units = chainUnits ?? (unitsPerHbar !== undefined ? BigInt(unitsPerHbar) : undefined);

  const secondsLeft = roundEndsAt !== undefined ? Number(roundEndsAt) - now : undefined;
  const statusName = statusLabel(status);

  const potHbar = pot !== undefined && units !== undefined ? formatEther(nativeToDisplayWei(pot, units)) : undefined;
  const potUsd =
    pot !== undefined && units !== undefined && quotePriceE18 !== undefined
      ? formatUsdE18((nativeToDisplayWei(pot, units) * quotePriceE18) / 10n ** 18n)
      : undefined;

  const balanceDisplay = balance ? formatEther(balance.value) : undefined;
  const minReserveDisplay =
    minReserve !== undefined && unitsPerHbar !== undefined
      ? formatEther(nativeToDisplayWei(minReserve, BigInt(unitsPerHbar)))
      : undefined;
  const reserveLow =
    balanceDisplay !== undefined &&
    minReserveDisplay !== undefined &&
    Number(balanceDisplay) < Number(minReserveDisplay);

  let topUpValue: bigint | undefined;
  let topUpError: string | undefined;
  try {
    topUpValue = topUp ? parseEther(topUp) : undefined;
  } catch {
    topUpError = "invalid HBAR amount";
  }

  const isCreator = account !== undefined && creator !== undefined && account.toLowerCase() === creator.toLowerCase();
  const canSweep = status === 2 && isCreator && balance !== undefined && balance.value > 0n;

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl bg-base-200 p-4">
            <div className="text-xs uppercase tracking-wider text-base-content/60">Round</div>
            <div className="text-2xl font-bold">
              {status === 0 ? "Not started" : `${round ?? "?"} / ${maxMembers ?? "?"}`}
            </div>
            <div className="text-xs text-base-content/60">{statusName}</div>
          </div>

          <div className="rounded-xl bg-base-200 p-4">
            <div className="text-xs uppercase tracking-wider text-base-content/60">
              {secondsLeft !== undefined && secondsLeft > 0 ? "Round ends in" : "Round clock"}
            </div>
            <div className="text-2xl font-bold">
              {status !== 1 ? (
                "-"
              ) : secondsLeft !== undefined && secondsLeft > 0 ? (
                formatCountdown(secondsLeft)
              ) : (
                <span className="text-warning">ended</span>
              )}
            </div>
            <div className="text-xs text-base-content/60">
              {usdAmountPerRound !== undefined ? `${formatUsdE18(usdAmountPerRound * 10n ** 12n)} owed / member` : ""}
            </div>
          </div>

          <div className="rounded-xl bg-base-200 p-4">
            <div className="text-xs uppercase tracking-wider text-base-content/60">Pot this round</div>
            <div className="text-2xl font-bold">{potHbar !== undefined ? `${potHbar} HBAR` : "-"}</div>
            <div className="text-xs text-base-content/60">{potUsd ? `≈ ${potUsd}` : ""}</div>
          </div>

          <div className="rounded-xl bg-base-200 p-4">
            <div className="text-xs uppercase tracking-wider text-base-content/60">Contributed</div>
            <div className="text-2xl font-bold">
              {contributorsThisRound !== undefined && maxMembers !== undefined
                ? `${contributorsThisRound}/${maxMembers}`
                : "-"}
            </div>
            <div className="text-xs text-base-content/60">members this round</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-base-content/60">Payout scheduling:</span>
          {pendingSchedule && pendingSchedule !== "0x0000000000000000000000000000000000000000" ? (
            <>
              <span className="badge badge-success">HSS scheduled</span>
              <span className="font-mono text-xs">
                {pendingSchedule.slice(0, 10)}...{pendingSchedule.slice(-6)}
              </span>
              {hashscanContractLink(targetNetwork, pendingSchedule) && (
                <a
                  className="link link-primary text-xs"
                  href={hashscanContractLink(targetNetwork, pendingSchedule)}
                  target="_blank"
                  rel="noreferrer"
                >
                  schedule on Hashscan
                </a>
              )}
            </>
          ) : status === 1 ? (
            <span className="badge badge-warning">no schedule - manual fallback (anyone can finalize)</span>
          ) : (
            <span className="badge badge-ghost">-</span>
          )}
        </div>

        <div className="divider m-0">HSS fee reserve</div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span>
            Balance: <strong>{balanceDisplay !== undefined ? `${balanceDisplay} HBAR` : "…"}</strong>
            {minReserveDisplay !== undefined && (
              <span className="text-base-content/60"> (min {minReserveDisplay})</span>
            )}
          </span>
          {reserveLow && <span className="badge badge-warning">low - scheduled payouts may fail</span>}
        </div>

        {status !== 2 && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="grow max-w-56">
              <BaseInput
                value={topUp}
                onChange={setTopUp}
                placeholder="top up"
                suffix={<span className="text-xs text-base-content/60">HBAR</span>}
                error={Boolean(topUpError)}
              />
            </div>
            <button
              className="btn btn-sm"
              disabled={!topUpValue || topUpValue <= 0n || writes.isPending}
              onClick={async () => {
                if (!topUpValue) return;
                const hash = await writes.topUp(topUpValue);
                if (hash) setTopUp("");
              }}
            >
              Top up reserve
            </button>
          </div>
        )}

        {canSweep && (
          <button className="btn btn-sm btn-primary" disabled={writes.isPending} onClick={() => writes.sweep()}>
            Sweep remaining reserve
          </button>
        )}
      </div>
    </div>
  );
};

"use client";

import { useEffect, useState } from "react";
import { BaseInput } from "@scaffold-hbar-ui/components";
import { type Address, formatEther, parseEther } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { committeeAbi } from "~~/contracts/committeeAbi";
import { type CommitteeReads, useCommitteeWrite, useNow } from "~~/hooks/committee/useCommittee";
import { useSelectedNetwork } from "~~/hooks/scaffold-hbar";
import { formatAge, formatCountdown, formatPriceE18 } from "~~/utils/committee";
import { nativeToDisplayWei } from "~~/utils/hbarUnits";

type Props = {
  committee: Address;
  reads: CommitteeReads;
  writes: ReturnType<typeof useCommitteeWrite>;
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** Join / contribute / finalize actions with every guard the contract enforces. */
export const JoinContributePanel = ({ committee, reads, writes }: Props) => {
  const { address: account } = useAccount();
  const selectedNetwork = useSelectedNetwork();
  const chainId = selectedNetwork.id;
  const now = useNow();
  const [amount, setAmount] = useState("");
  const [prefilled, setPrefilled] = useState(false);

  const {
    status,
    round,
    roundEndsAt,
    maxMembers,
    members,
    memberSlot,
    unitsPerHbar,
    quoteRequired,
    quotePriceE18,
    quoteUpdatedAt,
    quoteFailed,
  } = reads;

  const { data: paid, refetch: refetchPaid } = useReadContract({
    address: committee,
    abi: committeeAbi,
    chainId,
    functionName: "paidInRound",
    args: [account ?? ZERO_ADDRESS, round ?? 1n],
    query: { enabled: Boolean(account && round && status === 1), refetchInterval: 5_000 },
  });

  const requiredDisplay =
    quoteRequired !== undefined && unitsPerHbar !== undefined
      ? nativeToDisplayWei(quoteRequired, unitsPerHbar)
      : undefined;
  const requiredHbar = requiredDisplay !== undefined ? formatEther(requiredDisplay) : undefined;

  useEffect(() => {
    if (!prefilled && requiredHbar) {
      setAmount(requiredHbar);
      setPrefilled(true);
    }
  }, [prefilled, requiredHbar]);

  const secondsLeft = roundEndsAt !== undefined ? Number(roundEndsAt) - now : undefined;
  const roundClosed = status === 1 && secondsLeft !== undefined && secondsLeft <= 0;
  const isMember = memberSlot !== undefined && memberSlot > 0n;

  let value: bigint | undefined;
  let amountError: string | undefined;
  try {
    value = amount ? parseEther(amount) : undefined;
  } catch {
    amountError = "invalid HBAR amount";
  }
  if (value !== undefined && requiredDisplay !== undefined && value < requiredDisplay) {
    amountError = `underpaid - at least ${requiredHbar} HBAR is required at the current price`;
  }

  const refresh = async () => {
    reads.refetch();
    await refetchPaid();
  };

  const contribute = async () => {
    if (!value || amountError) return;
    const hash = await writes.contribute(value);
    if (hash) {
      setAmount("");
      setPrefilled(false);
      await refresh();
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <h2 className="card-title m-0">
          {status === 0 ? "Join the committee" : status === 1 ? `Contribute - round ${round}` : "Completed"}
        </h2>

        {status === 0 && (
          <>
            <p className="text-sm text-base-content/70 m-0">
              Join order is payout order. The round starts when all {maxMembers} slots are filled - members{" "}
              {members?.length ?? 0}/{maxMembers} so far.
            </p>
            {isMember ? (
              <div className="alert alert-success">
                <span>You joined at slot {memberSlot?.toString()} - waiting for the last member.</span>
              </div>
            ) : (
              <button className="btn btn-primary" disabled={writes.isPending} onClick={() => writes.join()}>
                Join committee
              </button>
            )}
          </>
        )}

        {status === 1 && (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="badge badge-outline">{formatCountdown(Math.max(secondsLeft ?? 0, 0))} left</span>
              {quotePriceE18 !== undefined && <span className="font-mono">{formatPriceE18(quotePriceE18)} / HBAR</span>}
              {quoteUpdatedAt !== undefined && (
                <span className="text-base-content/60">price {formatAge(now - Number(quoteUpdatedAt))}</span>
              )}
            </div>

            {quoteFailed ? (
              <div className="alert alert-warning">
                <span>
                  The oracle has no fresh answer (stale or zero price). <code className="text-xs">contribute()</code>{" "}
                  reverts until the feed recovers - the USD peg is never guessed.
                </span>
              </div>
            ) : !isMember ? (
              <div className="alert">
                <span>Only members can contribute - membership closed when the round started.</span>
              </div>
            ) : paid ? (
              <div className="alert alert-success">
                <span>
                  You contributed this round (round {round?.toString()}). Your refund of any overpayment was sent in the
                  same transaction.
                </span>
              </div>
            ) : roundClosed ? (
              <div className="alert alert-warning">
                <span>Round {round?.toString()} closed - waiting for the payout to finalize.</span>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span>
                    This round requires <strong className="font-mono">{requiredHbar ?? "…"}</strong> HBAR
                  </span>
                  {requiredHbar && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setAmount(requiredHbar);
                        setPrefilled(true);
                      }}
                    >
                      use exact quote
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grow max-w-64">
                    <BaseInput
                      value={amount}
                      onChange={setAmount}
                      placeholder="0.00"
                      suffix={<span className="text-xs text-base-content/60">HBAR</span>}
                      error={Boolean(amountError)}
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    disabled={!value || Boolean(amountError) || writes.isPending || requiredDisplay === undefined}
                    onClick={contribute}
                  >
                    Contribute
                  </button>
                </div>
                {amountError && <span className="text-xs text-error">{amountError}</span>}
                <p className="text-xs text-base-content/60 m-0">
                  Anything above the required amount is refunded in the same transaction. The contract re-prices the
                  oracle at execution - if the price moved past your buffer the tx reverts instead of underpaying.
                </p>
              </>
            )}
          </>
        )}

        {status === 2 && (
          <p className="text-sm text-base-content/70 m-0">
            All {maxMembers} rounds were paid out. The creator can sweep any leftover HSS fee reserve.
          </p>
        )}

        {status === 1 && roundClosed && <div className="divider m-0">Round ended</div>}
        {status === 1 && roundClosed && (
          <button className="btn btn-warning" disabled={writes.isPending} onClick={() => writes.finalize()}>
            Finalize round {round?.toString()} (permissionless)
          </button>
        )}
      </div>
    </div>
  );
};

"use client";

import { useEffect, useState } from "react";
import { BaseInput } from "@scaffold-hbar-ui/components";
import { formatEther, parseEther } from "viem";
import { useScaffoldReadContract, useScaffoldWriteContract, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { formatDuration } from "~~/utils/committee";
import { nativeToDisplayWei } from "~~/utils/hbarUnits";
import { postHcsRecord } from "~~/utils/hcs";

const DURATION_OPTIONS = [600, 3600, 21_600, 86_400, 259_200];
const PRICE_AGE_OPTIONS = [900, 3600, 21_600, 86_400];

const USD_PATTERN = /^\d{1,4}(\.\d{1,6})?$/;

/** Create-form for the factory: USD installment, members, round length, reserve. */
export const CreateCommitteeCard = () => {
  const { targetNetwork } = useTargetNetwork();
  const [usd, setUsd] = useState("20");
  const [members, setMembers] = useState("5");
  const [duration, setDuration] = useState("3600");
  const [priceAge, setPriceAge] = useState("3600");
  const [reserve, setReserve] = useState("");
  const [touched, setTouched] = useState(false);

  const { data: minReserve } = useScaffoldReadContract({
    contractName: "CommitteeFactory",
    functionName: "minReserve",
  });
  const { data: unitsPerHbar } = useScaffoldReadContract({
    contractName: "CommitteeFactory",
    functionName: "unitsPerHbar",
  });

  const minReserveHbar =
    minReserve !== undefined && unitsPerHbar !== undefined
      ? formatEther(nativeToDisplayWei(minReserve, BigInt(unitsPerHbar)))
      : undefined;

  useEffect(() => {
    if (!touched && minReserveHbar) setReserve(minReserveHbar);
  }, [touched, minReserveHbar]);

  const { writeContractAsync, isPending } = useScaffoldWriteContract({
    contractName: "CommitteeFactory",
  });

  const usdValid = USD_PATTERN.test(usd) && Number(usd) >= 1 && Number(usd) <= 1000;
  const membersValid = /^\d+$/.test(members) && Number(members) >= 2 && Number(members) <= 10;

  let reserveValue: bigint | undefined;
  let reserveError: string | undefined;
  try {
    reserveValue = parseEther(reserve || "0");
    if (minReserve !== undefined && unitsPerHbar !== undefined) {
      const minValue = nativeToDisplayWei(minReserve, BigInt(unitsPerHbar));
      if (reserveValue < minValue) {
        reserveError = `reserve must be at least ${minReserveHbar} HBAR (HSS fee float, never part of the pot)`;
      }
    }
  } catch {
    reserveError = "enter a valid HBAR amount";
  }

  const valid = usdValid && membersValid && reserveValue !== undefined && !reserveError;

  const submit = async () => {
    if (!valid || reserveValue === undefined) return;
    const usdE6 = BigInt(Math.round(Number(usd) * 1_000_000));
    try {
      await writeContractAsync(
        {
          functionName: "createCommittee",
          args: [usdE6, Number(members), BigInt(duration), BigInt(priceAge)],
          value: reserveValue,
        },
        {
          onBlockConfirmation: receipt => {
            void postHcsRecord(receipt.transactionHash, targetNetwork.id);
          },
        },
      );
      setReserve("");
      setTouched(false);
    } catch {
      // useTransactor already reported the failure
    }
  };

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div>
          <h2 className="card-title">Create a committee</h2>
          <p className="text-sm text-base-content/70 m-0">
            Members owe a fixed USD amount per round; the contract prices it in HBAR at contribution time via the
            oracle. Rounds last {formatDuration(Number(duration))}.
          </p>
        </div>

        <label className="form-control">
          <div className="label py-1">
            <span className="label-text">USD per round</span>
          </div>
          <BaseInput
            value={usd}
            onChange={setUsd}
            placeholder="20"
            suffix={<span className="text-xs text-base-content/60">USD</span>}
            error={usd !== "" && !usdValid}
          />
          {usd !== "" && !usdValid && (
            <span className="text-xs text-error mt-1">between 1 and 1000 (max 6 decimals)</span>
          )}
        </label>

        <label className="form-control">
          <div className="label py-1">
            <span className="label-text">Members (incl. you)</span>
          </div>
          <select
            className="select select-bordered w-full"
            value={members}
            onChange={event => setMembers(event.target.value)}
          >
            {Array.from({ length: 9 }, (_, i) => i + 2).map(count => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="form-control">
            <div className="label py-1">
              <span className="label-text">Round length</span>
            </div>
            <select
              className="select select-bordered w-full"
              value={duration}
              onChange={event => setDuration(event.target.value)}
            >
              {DURATION_OPTIONS.map(seconds => (
                <option key={seconds} value={seconds}>
                  {formatDuration(seconds)}
                </option>
              ))}
            </select>
          </label>

          <label className="form-control">
            <div className="label py-1">
              <span className="label-text">Max oracle price age</span>
            </div>
            <select
              className="select select-bordered w-full"
              value={priceAge}
              onChange={event => setPriceAge(event.target.value)}
            >
              {PRICE_AGE_OPTIONS.map(seconds => (
                <option key={seconds} value={seconds}>
                  {formatDuration(seconds)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="form-control">
          <div className="label py-1">
            <span className="label-text">HSS fee reserve</span>
          </div>
          <BaseInput
            value={reserve}
            onChange={value => {
              setTouched(true);
              setReserve(value);
            }}
            placeholder="0.5"
            suffix={<span className="text-xs text-base-content/60">HBAR</span>}
            error={Boolean(reserveError)}
          />
          {reserveError && <span className="text-xs text-error mt-1">{reserveError}</span>}
        </label>

        <button className="btn btn-primary" onClick={submit} disabled={!valid || isPending}>
          {isPending ? <span className="loading loading-spinner" aria-hidden /> : null}
          Create committee
        </button>
      </div>
    </div>
  );
};

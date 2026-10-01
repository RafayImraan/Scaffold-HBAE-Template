"use client";

import { Address } from "@scaffold-hbar-ui/components";
import type { Address as AddressType } from "viem";
import { formatEther } from "viem";
import { type CommitteeEvent, type CommitteeReads, eventArg } from "~~/hooks/committee/useCommittee";
import { useSelectedNetwork, useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { nativeToDisplayWei } from "~~/utils/hbarUnits";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar";

type Props = {
  reads: CommitteeReads;
  events: CommitteeEvent[];
};

const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

/** Member roster (with per-round payout ticks) and the finalized-payout history. */
export const MembersPanel = ({ reads, events }: Props) => {
  const { targetNetwork } = useTargetNetwork();
  const selectedNetwork = useSelectedNetwork();
  const chainId = selectedNetwork.id;

  const { members, round, status, unitsPerHbar } = reads;
  const finalized = events.filter(event => event.name === "RoundFinalized");
  const contributionsThisRound = events.filter(
    event => event.name === "ContributionReceived" && round !== undefined && eventArg<bigint>(event, "round") === round,
  );

  const memberRoundsPaid = (member: AddressType) =>
    finalized.filter(event => same(eventArg<AddressType>(event, "receiver"), member)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <h2 className="card-title m-0">Members & payout order</h2>
          {!members || members.length === 0 ? (
            <p className="text-sm text-base-content/60 m-0">No members yet - the committee is still open.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Member</th>
                    <th>Receives pot in</th>
                    <th>Paid rounds</th>
                    <th>This round</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, index) => {
                    const paidCount = memberRoundsPaid(member);
                    const contributedNow = contributionsThisRound.some(event =>
                      same(eventArg<AddressType>(event, "member"), member),
                    );
                    return (
                      <tr key={member}>
                        <td>{index + 1}</td>
                        <td>
                          <Address address={member} format="short" size="sm" disableAddressLink chain={targetNetwork} />
                        </td>
                        <td>round {index + 1}</td>
                        <td>
                          {paidCount === 0 ? (
                            <span className="text-base-content/40">-</span>
                          ) : (
                            <span className="badge badge-success">{paidCount}</span>
                          )}
                        </td>
                        <td>
                          {status !== 1 ? (
                            <span className="text-base-content/40">-</span>
                          ) : contributedNow ? (
                            <span className="badge badge-success">paid</span>
                          ) : (
                            <span className="badge badge-ghost">owed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <h2 className="card-title m-0">Payout history</h2>
          {finalized.length === 0 ? (
            <p className="text-sm text-base-content/60 m-0">
              No payouts yet - the first round finalizes at its deadline.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Round</th>
                    <th>Receiver</th>
                    <th>Amount</th>
                    <th>Contributed</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {[...finalized]
                    .sort(
                      (a, b) => Number(eventArg<bigint>(a, "round") ?? 0n) - Number(eventArg<bigint>(b, "round") ?? 0n),
                    )
                    .map(event => {
                      const roundNumber = eventArg<bigint>(event, "round");
                      const receiver = eventArg<AddressType>(event, "receiver");
                      const amount = eventArg<bigint>(event, "amount");
                      const contributors = eventArg<bigint>(event, "contributors");
                      const missed = eventArg<bigint>(event, "missed");
                      const total =
                        contributors !== undefined && missed !== undefined ? contributors + missed : undefined;
                      return (
                        <tr key={`${event.blockNumber}-${event.logIndex}`}>
                          <td>{roundNumber?.toString()}</td>
                          <td>
                            {receiver && (
                              <Address
                                address={receiver}
                                format="short"
                                size="sm"
                                disableAddressLink
                                chain={targetNetwork}
                              />
                            )}
                          </td>
                          <td className="font-mono">
                            {amount !== undefined && unitsPerHbar !== undefined
                              ? `${formatEther(nativeToDisplayWei(amount, unitsPerHbar))} HBAR`
                              : amount?.toString()}
                          </td>
                          <td>
                            {contributors?.toString()}/{total?.toString()}
                          </td>
                          <td>
                            {getBlockExplorerTxLink(chainId, event.txHash) ? (
                              <a
                                className="link link-primary text-xs"
                                href={getBlockExplorerTxLink(chainId, event.txHash)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                view
                              </a>
                            ) : (
                              <span className="text-base-content/40">local</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

"use client";

import { use } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Address } from "@scaffold-hbar-ui/components";
import { type Address as AddressType, isAddress } from "viem";
import { useAccount } from "wagmi";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { AuditTrailPanel } from "~~/components/committee/AuditTrailPanel";
import { JoinContributePanel } from "~~/components/committee/JoinContributePanel";
import { MembersPanel } from "~~/components/committee/MembersPanel";
import { OverviewSection } from "~~/components/committee/OverviewSection";
import { useCommitteeEvents, useCommitteeReads, useCommitteeWrite } from "~~/hooks/committee/useCommittee";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { formatDuration, formatUsdE6, hashscanContractLink, statusLabel } from "~~/utils/committee";

type Props = { params: Promise<{ address: string }> };

const STATUS_BADGE: Record<string, string> = {
  Open: "badge-info",
  Active: "badge-success",
  Completed: "badge-ghost",
};

const CommitteePage = ({ params }: Props) => {
  const { address } = use(params);
  const committee = isAddress(address) ? (address as AddressType) : undefined;

  const { address: account } = useAccount();
  const { targetNetwork } = useTargetNetwork();

  // Hooks run unconditionally on the (possibly invalid) address; invalid -> 404 below.
  const reads = useCommitteeReads(committee, account);
  const events = useCommitteeEvents(committee);
  const writes = useCommitteeWrite(committee);

  if (!committee) notFound();

  const { status, maxMembers, usdAmountPerRound, roundDuration, maxPriceAge } = reads;
  const statusName = statusLabel(status);
  const contractLink = hashscanContractLink(targetNetwork, committee);

  return (
    <div className="w-full max-w-6xl mx-auto px-5 py-8 flex flex-col gap-6">
      <Link href="/" className="btn btn-ghost btn-sm self-start">
        <ArrowLeftIcon className="h-4 w-4" />
        Committees
      </Link>

      <div className="card bg-base-100 border border-base-300">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className={`badge ${STATUS_BADGE[statusName]} badge-lg`}>{statusName}</span>
                <h1 className="text-2xl font-bold m-0">Committee</h1>
              </div>
              <Address
                address={committee}
                format="long"
                size="base"
                chain={targetNetwork}
                blockExplorerAddressLink={contractLink}
              />
            </div>
            {contractLink && (
              <a className="link link-primary text-sm" href={contractLink} target="_blank" rel="noreferrer">
                View on Hashscan
              </a>
            )}
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            {usdAmountPerRound !== undefined && (
              <span className="badge badge-outline">{formatUsdE6(usdAmountPerRound)} / round</span>
            )}
            {maxMembers !== undefined && <span className="badge badge-outline">{maxMembers} members</span>}
            {roundDuration !== undefined && (
              <span className="badge badge-outline">{formatDuration(Number(roundDuration))} rounds</span>
            )}
            {maxPriceAge !== undefined && (
              <span className="badge badge-outline">price age ≤ {formatDuration(Number(maxPriceAge))}</span>
            )}
          </div>
        </div>
      </div>

      <OverviewSection committee={committee} reads={reads} writes={writes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <JoinContributePanel committee={committee} reads={reads} writes={writes} />
        <AuditTrailPanel committee={committee} />
      </div>

      <MembersPanel reads={reads} events={events.data ?? []} />
    </div>
  );
};

export default CommitteePage;

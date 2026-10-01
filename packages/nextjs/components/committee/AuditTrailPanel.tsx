"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useTargetNetwork } from "~~/hooks/scaffold-hbar";
import { hashscanTopicLink } from "~~/utils/committee";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-hbar";

type HcsEvent = { type: string; contract: string; logIndex: number; args: Record<string, unknown> };
type HcsContent = { chainId: number; txHash: string; blockNumber: string; events: HcsEvent[] };
type HcsMessage = {
  consensusTimestamp: string;
  sequenceNumber: number;
  content: HcsContent | null;
};

type HcsResponse = {
  configured: boolean;
  topicId: string | null;
  messages: HcsMessage[];
};

const consensusTime = (timestamp: string) => {
  const [seconds] = timestamp.split(".");
  return new Date(Number(seconds) * 1000).toLocaleString();
};

/** Committee-filtered view of the HCS audit log (GET /api/hcs -> mirror node). */
export const AuditTrailPanel = ({ committee }: { committee: Address }) => {
  const { targetNetwork } = useTargetNetwork();
  const chainId = targetNetwork.id;

  const { data, isLoading, error } = useQuery<HcsResponse>({
    queryKey: ["hcs-audit", chainId],
    refetchInterval: 30_000,
    queryFn: async () => {
      const response = await fetch(`/api/hcs?limit=100`);
      if (!response.ok) throw new Error(`HCS route responded ${response.status}`);
      return (await response.json()) as HcsResponse;
    },
  });

  const messages = (data?.messages ?? []).filter(message =>
    message.content?.events?.some(event => event.contract?.toLowerCase() === committee.toLowerCase()),
  );

  return (
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="card-title m-0">HCS audit trail</h2>
          {data?.topicId && hashscanTopicLink(targetNetwork, data.topicId) && (
            <a
              className="link link-primary text-sm"
              href={hashscanTopicLink(targetNetwork, data.topicId)}
              target="_blank"
              rel="noreferrer"
            >
              topic {data.topicId} on Hashscan
            </a>
          )}
        </div>

        {isLoading ? (
          <div className="h-24 rounded bg-base-200 animate-pulse" aria-hidden />
        ) : error ? (
          <div className="alert alert-error">
            <span>Could not reach the HCS read route: {(error as Error).message}</span>
          </div>
        ) : data?.configured === false ? (
          <div className="alert">
            <span>
              HCS audit log not configured - create a topic and set <code className="text-xs">HCS_TOPIC_ID</code> (see
              README). Transactions work without it; the tamper-evident log stays empty.
            </span>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-base-content/60 m-0">
            No audit records for this committee yet - they appear right after the first confirmed transaction.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {messages.map(message => {
              const content = message.content as HcsContent;
              return (
                <div
                  key={message.sequenceNumber}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-base-300 px-3 py-2 text-sm"
                >
                  <span className="badge badge-ghost badge-sm">#{message.sequenceNumber}</span>
                  <span className="text-base-content/60 text-xs">{consensusTime(message.consensusTimestamp)}</span>
                  <span className="flex flex-wrap gap-1">
                    {content.events.map(event => (
                      <span key={`${event.logIndex}`} className="badge badge-info badge-sm">
                        {event.type}
                        {typeof event.args.round === "string" ? ` (${event.args.round})` : ""}
                      </span>
                    ))}
                  </span>
                  <a
                    className="link link-primary text-xs ml-auto"
                    href={getBlockExplorerTxLink(content.chainId, content.txHash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    tx
                  </a>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

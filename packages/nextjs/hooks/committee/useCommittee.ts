import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Address, decodeEventLog, parseAbiItem } from "viem";
import { useAccount, usePublicClient, useReadContracts, useWriteContract } from "wagmi";
import { committeeAbi } from "~~/contracts/committeeAbi";
import { useDeployedContractInfo, useSelectedNetwork, useTransactor } from "~~/hooks/scaffold-hbar";
import scaffoldConfig from "~~/scaffold.config";
import { postHcsRecord } from "~~/utils/hcs";
import { AllowedChainIds, notification } from "~~/utils/scaffold-hbar";

const REFRESH_MS = scaffoldConfig.pollingInterval;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

const committeeCreatedEvent = parseAbiItem(
  "event CommitteeCreated(uint256 indexed index, address indexed committee, address indexed creator, uint256 usdAmountPerRound, uint8 maxMembers, uint256 roundDuration, uint256 maxPriceAge)",
);

export type CommitteeReads = {
  isLoading: boolean;
  refetch: () => void;
  status: number | undefined;
  round: bigint | undefined;
  roundEndsAt: bigint | undefined;
  pot: bigint | undefined;
  contributorsThisRound: bigint | undefined;
  usdAmountPerRound: bigint | undefined;
  maxMembers: number | undefined;
  roundDuration: bigint | undefined;
  maxPriceAge: bigint | undefined;
  unitsPerHbar: bigint | undefined;
  creator: Address | undefined;
  pendingSchedule: Address | undefined;
  scheduleService: Address | undefined;
  oracle: Address | undefined;
  members: readonly Address[] | undefined;
  /** 1-based join slot; 0 = not a member. */
  memberSlot: bigint | undefined;
  quoteRequired: bigint | undefined;
  quotePriceE18: bigint | undefined;
  quoteUpdatedAt: bigint | undefined;
  /** The oracle call itself failed (stale/zero price): contributions are blocked on-chain too. */
  quoteFailed: boolean;
};

/**
 * All committee state in one batched read. Every field is allowed to be absent
 * (contract not deployed, RPC hiccup) - components render skeletons/errors.
 */
export function useCommitteeReads(committee: Address | undefined, account: Address | undefined): CommitteeReads {
  const selectedNetwork = useSelectedNetwork();
  const chainId = selectedNetwork.id;

  const { data, isLoading, refetch } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: committee, abi: committeeAbi, chainId, functionName: "status" },
      { address: committee, abi: committeeAbi, chainId, functionName: "round" },
      { address: committee, abi: committeeAbi, chainId, functionName: "roundEndsAt" },
      { address: committee, abi: committeeAbi, chainId, functionName: "pot" },
      { address: committee, abi: committeeAbi, chainId, functionName: "contributorsThisRound" },
      { address: committee, abi: committeeAbi, chainId, functionName: "usdAmountPerRound" },
      { address: committee, abi: committeeAbi, chainId, functionName: "maxMembers" },
      { address: committee, abi: committeeAbi, chainId, functionName: "roundDuration" },
      { address: committee, abi: committeeAbi, chainId, functionName: "maxPriceAge" },
      { address: committee, abi: committeeAbi, chainId, functionName: "unitsPerHbar" },
      { address: committee, abi: committeeAbi, chainId, functionName: "creator" },
      { address: committee, abi: committeeAbi, chainId, functionName: "pendingSchedule" },
      { address: committee, abi: committeeAbi, chainId, functionName: "scheduleService" },
      { address: committee, abi: committeeAbi, chainId, functionName: "oracle" },
      { address: committee, abi: committeeAbi, chainId, functionName: "getMembers" },
      { address: committee, abi: committeeAbi, chainId, functionName: "memberIndex", args: [account ?? ZERO_ADDRESS] },
      { address: committee, abi: committeeAbi, chainId, functionName: "quoteContribution" },
    ],
    query: { enabled: Boolean(committee), refetchInterval: REFRESH_MS },
  });

  const at = <T>(index: number): T | undefined => {
    const entry = data?.[index];
    return entry && entry.status === "success" ? (entry.result as T) : undefined;
  };

  const status = at<bigint | number>(0);
  const maxMembers = at<bigint | number>(6);
  const quote = data?.[16];

  return {
    isLoading,
    refetch,
    status: status === undefined ? undefined : Number(status),
    round: at(1),
    roundEndsAt: at(2),
    pot: at(3),
    contributorsThisRound: at(4),
    usdAmountPerRound: at(5),
    maxMembers: maxMembers === undefined ? undefined : Number(maxMembers),
    roundDuration: at(7),
    maxPriceAge: at(8),
    unitsPerHbar: at(9),
    creator: at(10),
    pendingSchedule: at(11),
    scheduleService: at(12),
    oracle: at(13),
    members: at(14),
    memberSlot: at(15),
    quoteRequired: quote?.status === "success" ? (quote.result as readonly [bigint, bigint, bigint])[0] : undefined,
    quotePriceE18: quote?.status === "success" ? (quote.result as readonly [bigint, bigint, bigint])[1] : undefined,
    quoteUpdatedAt: quote?.status === "success" ? (quote.result as readonly [bigint, bigint, bigint])[2] : undefined,
    quoteFailed: quote?.status === "failure",
  };
}

export type CommitteeEvent = {
  name: string;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  args: Record<string, unknown>;
};

export function eventArg<T>(event: CommitteeEvent, name: string): T | undefined {
  const value = event.args[name];
  return value === undefined ? undefined : (value as T);
}

/**
 * Decoded events emitted by one committee, newest first. Starts at the
 * CommitteeCreated block so the log range never spans the whole chain.
 */
export function useCommitteeEvents(committee: Address | undefined) {
  const selectedNetwork = useSelectedNetwork();
  const chainId = selectedNetwork.id;
  const publicClient = usePublicClient({ chainId });
  const factory = useDeployedContractInfo({
    contractName: "CommitteeFactory",
    chainId: chainId as AllowedChainIds,
  });

  return useQuery({
    queryKey: ["committeeEvents", chainId, committee],
    enabled: Boolean(committee && publicClient && factory.data),
    refetchInterval: REFRESH_MS,
    queryFn: async (): Promise<CommitteeEvent[]> => {
      if (!committee || !publicClient || !factory.data) return [];
      const registryBlock = BigInt(factory.data.deployedOnBlock ?? 0);
      const creation = await publicClient.getLogs({
        address: factory.data.address,
        event: committeeCreatedEvent,
        args: { committee },
        fromBlock: registryBlock,
        toBlock: "latest",
      });
      const startBlock = creation[0]?.blockNumber ?? registryBlock;
      const logs = await publicClient.getLogs({ address: committee, fromBlock: startBlock, toBlock: "latest" });

      const events: CommitteeEvent[] = [];
      for (const log of logs) {
        if (log.blockNumber === null || log.transactionHash === null) continue;
        try {
          const decoded = decodeEventLog({ abi: committeeAbi, data: log.data, topics: log.topics });
          events.push({
            name: decoded.eventName,
            blockNumber: log.blockNumber,
            logIndex: log.logIndex,
            txHash: log.transactionHash,
            args: (decoded.args ?? {}) as Record<string, unknown>,
          });
        } catch {
          // An event this ABI cannot decode is not ours to display.
        }
      }
      return events.reverse();
    },
  });
}

export type CommitteeAction = "join" | "contribute" | "finalizeRound" | "topUpReserve" | "sweepReserve";

/**
 * Wallet-gated writes to a committee instance (any address, so the scaffold's
 * deployment-address hooks do not apply). Each confirmed transaction is also
 * posted to /api/hcs for the audit log.
 */
export function useCommitteeWrite(committee: Address | undefined) {
  const selectedNetwork = useSelectedNetwork();
  const { chain, status } = useAccount();
  const { writeContractAsync, isPending } = useWriteContract();
  const transactor = useTransactor();

  const walletReady = (): boolean => {
    if (status !== "connected" || !chain?.id) {
      notification.error("Connect your wallet first");
      return false;
    }
    if (chain.id !== selectedNetwork.id) {
      notification.error(`Wallet is on the wrong network - switch to ${selectedNetwork.name}`);
      return false;
    }
    return true;
  };

  // The value-less and payable writes are separate so viem's per-function
  // payable/nonpayable typing stays exact (all five actions take no arguments).
  const executeSimple = useCallback(
    async (functionName: "join" | "finalizeRound" | "sweepReserve"): Promise<string | undefined> => {
      if (!committee || !walletReady()) return undefined;
      const hash = await transactor(() =>
        writeContractAsync({ address: committee, abi: committeeAbi, chainId: selectedNetwork.id, functionName }),
      );
      if (hash) await postHcsRecord(hash, selectedNetwork.id);
      return hash;
    },
    [committee, chain?.id, status, selectedNetwork, transactor, writeContractAsync],
  );

  const executePayable = useCallback(
    async (functionName: "contribute" | "topUpReserve", value: bigint): Promise<string | undefined> => {
      if (!committee || !walletReady()) return undefined;
      const hash = await transactor(() =>
        writeContractAsync({ address: committee, abi: committeeAbi, chainId: selectedNetwork.id, functionName, value }),
      );
      if (hash) await postHcsRecord(hash, selectedNetwork.id);
      return hash;
    },
    [committee, chain?.id, status, selectedNetwork, transactor, writeContractAsync],
  );

  return {
    isPending,
    join: () => executeSimple("join"),
    finalize: () => executeSimple("finalizeRound"),
    sweep: () => executeSimple("sweepReserve"),
    contribute: (value: bigint) => executePayable("contribute", value),
    topUp: (value: bigint) => executePayable("topUpReserve", value),
  };
}

/** Local clock ticking every second (countdowns, price age). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

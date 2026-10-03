import { NextRequest, NextResponse } from "next/server";
import {
  AccountId,
  Client,
  PrivateKey,
  Timestamp,
  TopicId,
  TopicMessageSubmitTransaction,
  TransactionId,
} from "@hiero-ledger/sdk";
import { type Abi, createPublicClient, decodeEventLog, http } from "viem";
import { committeeAbi } from "~~/contracts/committeeAbi";
import deployedContracts from "~~/contracts/deployedContracts";
import scaffoldConfig from "~~/scaffold.config";
import { loadRootEnv } from "~~/utils/loadRootEnv";

export const dynamic = "force-dynamic";

const DEFAULT_RPC: Record<number, string> = {
  296: "https://testnet.hashio.io/api",
  295: "https://mainnet.hashio.io/api",
};

const TX_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const MAX_RECORD_BYTES = 900;

type Deployment = { address: `0x${string}`; abi: Abi };

function getFactory(chainId: number): Deployment | null {
  const byChain = deployedContracts as unknown as Record<string, Record<string, Deployment>>;
  const factory = byChain[String(chainId)]?.CommitteeFactory;
  if (!factory?.address) return null;
  return factory;
}

function bigintSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item)),
  ) as unknown;
}

/**
 * Lists topic messages from the mirror node (read path, no keys involved).
 */
export async function GET(request: NextRequest) {
  loadRootEnv();
  const topicId = process.env.HCS_TOPIC_ID;
  if (!topicId) {
    return NextResponse.json({ configured: false, topicId: null, messages: [] });
  }

  const chainId: number = scaffoldConfig.targetNetworks[0].id;
  const mirrorHost =
    chainId === 295 ? "https://mainnet.mirrornode.hedera.com" : "https://testnet.mirrornode.hedera.com";
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "25");
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : 25, 1), 100);

  type MirrorMessage = { consensus_timestamp: string; sequence_number: number; contents: string };
  let payload: { messages?: MirrorMessage[] };
  try {
    const response = await fetch(`${mirrorHost}/api/v1/topics/${topicId}/messages?limit=${limit}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: `mirror node responded ${response.status}` }, { status: 502 });
    }
    payload = (await response.json()) as { messages?: MirrorMessage[] };
  } catch {
    return NextResponse.json({ error: "mirror node unreachable" }, { status: 502 });
  }

  const messages = (payload.messages ?? []).map(message => {
    let content: unknown = null;
    try {
      content = JSON.parse(Buffer.from(message.contents, "base64").toString("utf8"));
    } catch {
      content = null;
    }
    return { consensusTimestamp: message.consensus_timestamp, sequenceNumber: message.sequence_number, content };
  });

  return NextResponse.json({ configured: true, topicId, messages });
}

/**
 * Accepts ONLY `{ txHash }`. The record is rebuilt from the receipt fetched over
 * RPC (status + logs decoded against our deployed ABIs, addresses restricted to
 * the committee registry) so nothing the client claims is trusted.
 */
export async function POST(request: NextRequest) {
  loadRootEnv();

  const operatorAccountId = process.env.HCS_OPERATOR_ACCOUNT_ID;
  const operatorKey = process.env.HCS_OPERATOR_PRIVATE_KEY;
  const topicId = process.env.HCS_TOPIC_ID;
  if (!operatorAccountId || !operatorKey || !topicId) {
    return NextResponse.json({ error: "HCS is not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
  }
  const fields = Object.keys(body);
  if (fields.length !== 1 || fields[0] !== "txHash") {
    return NextResponse.json({ error: "only { txHash } is accepted" }, { status: 400 });
  }
  const { txHash } = body as { txHash?: unknown };
  if (typeof txHash !== "string" || !TX_HASH_PATTERN.test(txHash)) {
    return NextResponse.json({ error: "txHash must be a 0x-prefixed 32-byte hash" }, { status: 400 });
  }

  const chainId: number = scaffoldConfig.targetNetworks[0].id;
  const factory = getFactory(chainId);
  if (!factory) {
    return NextResponse.json({ error: "no deployment recorded for this network" }, { status: 503 });
  }

  const rpcUrl = process.env.HCS_RPC_URL || DEFAULT_RPC[chainId] || DEFAULT_RPC[296];
  const client = createPublicClient({ transport: http(rpcUrl) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
  } catch (error) {
    if ((error as Error)?.name === "TransactionReceiptNotFoundError") {
      return NextResponse.json({ error: "transaction not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "RPC endpoint unavailable" }, { status: 502 });
  }
  if (receipt.status !== "success") {
    return NextResponse.json({ error: "transaction failed - nothing to record" }, { status: 409 });
  }

  let committees: readonly `0x${string}`[];
  try {
    committees = (await client.readContract({
      address: factory.address,
      abi: factory.abi,
      functionName: "getCommittees",
    })) as readonly `0x${string}`[];
  } catch {
    return NextResponse.json({ error: "could not read the committee registry" }, { status: 502 });
  }

  // topic0 allow-list (our ABIs) + sender address allow-list (registry members only)
  const allowedAddresses = new Set([factory.address, ...committees].map(address => address.toLowerCase()));
  const abi = [...committeeAbi, ...factory.abi] as Abi;
  const events: Array<{ type: string; contract: string; logIndex: number; args: unknown }> = [];
  for (const log of receipt.logs) {
    if (!allowedAddresses.has(log.address.toLowerCase())) continue;
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      events.push({
        type: decoded.eventName ?? "UnknownEvent",
        contract: log.address,
        logIndex: log.logIndex,
        args: bigintSafe(decoded.args),
      });
    } catch {
      // not one of our event signatures - ignored
    }
  }
  if (events.length === 0) {
    return NextResponse.json({ error: "no verified committee events in this transaction" }, { status: 409 });
  }

  const record = bigintSafe({ chainId, txHash, blockNumber: receipt.blockNumber, events });
  const canonical = JSON.stringify(record);
  if (Buffer.byteLength(canonical, "utf8") > MAX_RECORD_BYTES) {
    return NextResponse.json({ error: "verified record exceeds 900 bytes" }, { status: 400 });
  }

  let sequenceNumber: string | null = null;
  try {
    const privateKey = PrivateKey.fromStringECDSA(operatorKey.replace(/^0x/, ""));
    const sdkClient = chainId === 295 ? Client.forMainnet() : Client.forTestnet();
    try {
      sdkClient.setOperator(AccountId.fromString(operatorAccountId), privateKey);
      // Anchor validStart to the latest network consensus time instead of the
      // local clock: a skewed server clock must never expire the submit.
      const latestBlock = await client.getBlock({ blockTag: "latest" });
      const validStart = Timestamp.fromDate(new Date(Number(latestBlock.timestamp) * 1000));
      const submit = await new TopicMessageSubmitTransaction()
        .setTopicId(TopicId.fromString(topicId))
        .setMessage(canonical)
        .setTransactionId(TransactionId.withValidStart(AccountId.fromString(operatorAccountId), validStart))
        .setTransactionValidDuration(180)
        .execute(sdkClient);
      const submitReceipt = await submit.getReceipt(sdkClient);
      sequenceNumber = submitReceipt.topicSequenceNumber?.toString() ?? null;
    } finally {
      sdkClient.close();
    }
  } catch (error) {
    console.error("HCS submit failed:", (error as Error).message);
    return NextResponse.json({ error: "HCS submit failed" }, { status: 502 });
  }

  return NextResponse.json({ sequenceNumber, events });
}

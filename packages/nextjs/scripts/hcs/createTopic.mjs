/**
 * Creates the HCS audit topic (submitKey = operator) and stores its id in the
 * root .env. Idempotent: exits if HCS_TOPIC_ID is already set.
 *
 * Runs from the nextjs workspace because @hiero-ledger/sdk lives there
 * (the /api/hcs route uses it too). No key is ever printed.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AccountId, Client, PrivateKey, Timestamp, TopicCreateTransaction, TransactionId } from "@hiero-ledger/sdk";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const envPath = path.join(rootDir, ".env");

const fail = message => {
  console.error(`error: ${message}`);
  process.exit(1);
};

if (!existsSync(envPath)) fail(`no .env at ${envPath}`);
process.loadEnvFile(envPath);

const operatorAccountId = process.env.HCS_OPERATOR_ACCOUNT_ID;
const operatorKeyHex = process.env.HCS_OPERATOR_PRIVATE_KEY;
if (!operatorAccountId || !operatorKeyHex) {
  fail("HCS_OPERATOR_ACCOUNT_ID and HCS_OPERATOR_PRIVATE_KEY must be set in the root .env");
}
if (process.env.HCS_TOPIC_ID) {
  console.log(`HCS_TOPIC_ID already set (${process.env.HCS_TOPIC_ID}); nothing to do.`);
  process.exit(0);
}

const key = PrivateKey.fromStringECDSA(operatorKeyHex.replace(/^0x/, ""));
const isMainnet = (process.env.HCS_RPC_URL || "").includes("mainnet");
const client = isMainnet ? Client.forMainnet() : Client.forTestnet();

try {
  client.setOperator(AccountId.fromString(operatorAccountId), key);
  // Anchor validStart to the latest network consensus time instead of the
  // local clock: a skewed server clock must never expire the transaction.
  const rpcUrl =
    process.env.HCS_RPC_URL ||
    (isMainnet ? "https://mainnet.hashio.io/api" : "https://testnet.hashio.io/api");
  const blockResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }),
  });
  const block = (await blockResponse.json()).result;
  const validStart = Timestamp.fromDate(new Date(Number(BigInt(block.timestamp)) * 1000));
  const response = await new TopicCreateTransaction()
    .setAdminKey(key.publicKey)
    .setSubmitKey(key.publicKey)
    .setTopicMemo("hedera-committee audit log")
    .setTransactionId(
      TransactionId.withValidStart(AccountId.fromString(operatorAccountId), validStart),
    )
    .setTransactionValidDuration(180)
    .execute(client);
  const receipt = await response.getReceipt(client);
  const topicId = receipt.topicId.toString();

  const env = readFileSync(envPath, "utf8");
  const entry = `HCS_TOPIC_ID=${topicId}`;
  const updated = /^HCS_TOPIC_ID=.*$/m.test(env)
    ? env.replace(/^HCS_TOPIC_ID=.*$/m, entry)
    : `${env.trimEnd()}\n${entry}\n`;
  writeFileSync(envPath, updated);

  console.log(`Created HCS topic ${topicId} (submitKey = operator ${operatorAccountId})`);
  console.log(`Wrote ${entry} to ${envPath}`);
} catch (error) {
  fail(`topic creation failed: ${error.message}`);
} finally {
  client.close();
}

/**
 * Testnet demo (PLAN §8): create → 2 members join → both contribute at the
 * quoted amount → wait for round end → verify whether HSS executed finalizeRound
 * on its own (manual fallback if not) → POST HCS audit records → print Hashscan
 * links and the unit-math reconciliation.
 *
 * Aborts (exit 2) before moving funds if the preflight shows insufficient HBAR.
 * Stops (exit 3) if scheduleCall reports failure (PayoutScheduleFailed or
 * ScheduleSkipped) so the design can be reviewed before any change.
 *
 * member2 is a throwaway in-memory ECDSA wallet; its private key is never
 * printed or persisted. Run: npx hardhat run scripts/demo/testnetDemo.ts --network hederaTestnet
 */
import type { TransactionReceipt, Log, EventLog } from "ethers";
import { deployments, ethers } from "hardhat";

const CHAIN_ID = 296;
const USD_PER_ROUND = 1_000_000n; // $1.00 (factory floor)
const MAX_MEMBERS = 2;
const ROUND_DURATION = 360; // seconds, within [300, 30 days]
const MAX_PRICE_AGE = 86_400; // 1 day - loose so reporter gaps don't flake
const HSS_GRACE_SECONDS = 180; // poll this long past roundEndsAt for HSS
const POLL_SECONDS = 15;
const MEMBER2_GAS_BUFFER = ethers.parseEther("0.5");
const GAS_SLACK = ethers.parseEther("1"); // create/join/finalize gas + buffer
const CONTRIBUTE_GAS_LIMIT = 300_000;
const JOIN_GAS_LIMIT = 300_000;
const CREATE_GAS_LIMIT = 2_000_000;
const HASHSCAN = "https://hashscan.io/testnet";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

function log(...parts: unknown[]): void {
  console.log(parts.map(p => (typeof p === "bigint" ? p.toString() : String(p))).join(" "));
}

function txLink(hash: string): string {
  return `${HASHSCAN}/tx/${hash}`;
}

function hbar(wei: bigint): string {
  return `${Number(wei) / 1e18} HBAR`;
}

async function postHcs(txHash: string): Promise<string> {
  try {
    const response = await fetch(`${APP_BASE_URL}/api/hcs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
    const body = (await response.json()) as { sequenceNumber?: string; error?: string };
    if (!response.ok) return `FAILED ${body.error ?? response.status}`;
    return `ok seq=${body.sequenceNumber ?? "?"}`;
  } catch (error) {
    return `FAILED app unreachable (${(error as Error).message})`;
  }
}

async function main(): Promise<void> {
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  if (chainId !== CHAIN_ID) {
    throw new Error(`expected chainId ${CHAIN_ID}, got ${chainId} - refusing to run`);
  }

  const [deployer] = await ethers.getSigners();
  const factory = await ethers.getContractAt("CommitteeFactory", (await deployments.get("CommitteeFactory")).address);
  const oracle = await ethers.getContractAt(
    "ChainlinkHbarUsdAdapter",
    (await deployments.get("ChainlinkHbarUsdAdapter")).address,
  );
  const minReserve = await factory.minReserve();
  const relayScale = (await factory.unitsPerHbar()) === 10n ** 8n ? 10n ** 10n : 1n;

  const deployerAddress = await deployer.getAddress();
  const factoryAddress = await factory.getAddress();
  log("=== hedera-committee testnet demo ===");
  log(`deployer (creator, member1): ${deployerAddress} ${HASHSCAN}/account/0.0.10806998`);
  log(`factory: ${factoryAddress} ${HASHSCAN}/contract/${factoryAddress}`);

  // Fetch gas price once to avoid estimation spikes
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("1000", "gwei");
  log(`gasPrice: ${gasPrice} wei`);

  // Independent quote formula (must match the contract's own quote below).
  const priceData = await oracle.latestPrice(await factory.PAIR_KEY());
  const numerator = USD_PER_ROUND * 10n ** 12n * 10n ** 8n;
  const requiredIndependent = numerator / priceData.priceE18 + (numerator % priceData.priceE18 === 0n ? 0n : 1n);
  const valueFor = (tinybars: bigint) => tinybars * relayScale;
  const needed = valueFor(minReserve) + valueFor(requiredIndependent) * 2n + MEMBER2_GAS_BUFFER + GAS_SLACK;
  const balance = await ethers.provider.getBalance(deployerAddress);
  log(`price: ${priceData.priceE18} (${Number(priceData.priceE18) / 1e18} USD/HBAR, updatedAt ${priceData.updatedAt})`);
  log(
    `required per member (independent formula): ${requiredIndependent} tinybars = ${hbar(valueFor(requiredIndependent))}`,
  );
  log(`deployer balance: ${hbar(balance)} | demo needs ≈ ${hbar(needed)}`);
  if (balance < needed) {
    console.error(`INSUFFICIENT FUNDS: short ≈ ${hbar(needed - balance)}. Fund ${deployerAddress} and re-run.`);
    process.exit(2);
  }

  // --- create ---
  const createTx = await factory.createCommittee(USD_PER_ROUND, MAX_MEMBERS, ROUND_DURATION, MAX_PRICE_AGE, {
    value: valueFor(minReserve),
    gasLimit: CREATE_GAS_LIMIT,
    gasPrice,
  });
  const createReceipt = await createTx.wait();
  if (!createReceipt) throw new Error("create receipt missing");
  const created = createReceipt.logs
    .map(logEntry => {
      try {
        return factory.interface.parseLog(logEntry as Log);
      } catch {
        return null;
      }
    })
    .find(parsed => parsed?.name === "CommitteeCreated");
  if (!created) throw new Error("CommitteeCreated event not found");
  const committeeAddress = created.args.committee as string;
  log(`committee: ${committeeAddress} ${HASHSCAN}/contract/${committeeAddress}`);
  log(`create tx: ${createReceipt.hash} ${txLink(createReceipt.hash)}`);
  log(`HCS create: ${await postHcs(createReceipt.hash)}`);

  const committee = await ethers.getContractAt("Committee", committeeAddress);
  const unitsPerHbar = await committee.unitsPerHbar();
  if (unitsPerHbar !== 10n ** 8n) throw new Error(`unexpected unitsPerHbar ${unitsPerHbar}`);
  const [contractQuote] = await committee.quoteContribution();
  log(`contract quote cross-check: ${contractQuote} | matches independent: ${contractQuote === requiredIndependent}`);
  if (contractQuote !== requiredIndependent) throw new Error("quote cross-check failed");

  // --- member2 (in-memory, key never printed) ---
  const member2 = ethers.Wallet.createRandom().connect(ethers.provider);
  const member2Address = await member2.getAddress();
  log(`member2 (throwaway): ${member2Address}`);
  await (
    await deployer.sendTransaction({
      to: member2Address,
      value: valueFor(requiredIndependent) + MEMBER2_GAS_BUFFER,
      gasPrice,
    })
  ).wait();

  // --- join (member1 first, so round 1 pays member1) ---
  const join1Receipt = await (await committee.join({ gasLimit: JOIN_GAS_LIMIT, gasPrice })).wait();
  if (!join1Receipt) throw new Error("join1 receipt missing");
  log(`join1 tx: ${join1Receipt.hash} ${txLink(join1Receipt.hash)}`);
  log(`HCS join1: ${await postHcs(join1Receipt.hash)}`);

  const join2Receipt = await (await committee.connect(member2).join({ gasLimit: JOIN_GAS_LIMIT, gasPrice })).wait();
  if (!join2Receipt) throw new Error("join2 receipt missing");
  log(`join2 tx: ${join2Receipt.hash} ${txLink(join2Receipt.hash)}`);
  log(`HCS join2: ${await postHcs(join2Receipt.hash)}`);

  // The second join starts round 1 and attempts the HSS schedule.
  const join2Events = join2Receipt.logs
    .map(logEntry => {
      try {
        return committee.interface.parseLog(logEntry as Log);
      } catch {
        return null;
      }
    })
    .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null);
  const scheduled = join2Events.find(e => e.name === "PayoutScheduled");
  const scheduleFailed = join2Events.find(e => e.name === "PayoutScheduleFailed");
  const scheduleSkipped = join2Events.find(e => e.name === "ScheduleSkipped");
  if (scheduleFailed || scheduleSkipped) {
    log(
      `CRITICAL: scheduleCall did not succeed on testnet: ${JSON.stringify({
        rc: scheduleFailed ? Number(scheduleFailed.args.rc) : null,
        skipped: Boolean(scheduleSkipped),
      })}`,
    );
    console.error("STOPPING: scheduleCall failure - report before any design change.");
    process.exit(3);
  }
  if (!scheduled) throw new Error("neither PayoutScheduled nor a failure event in join2");
  log(`HSS schedule: ${scheduled.args.schedule} executeAt=${scheduled.args.executeAt}`);

  const roundEndsAt = Number(await committee.roundEndsAt());
  log(`round 1 ends at ${roundEndsAt} (≈ ${new Date(roundEndsAt * 1000).toISOString()})`);

  // --- contribute at the quoted amount (exact → refund must be 0) ---
  const receipt1 = await (await committee.contribute({ value: valueFor(contractQuote), gasLimit: CONTRIBUTE_GAS_LIMIT, gasPrice })).wait();
  if (!receipt1) throw new Error("contribute1 receipt missing");
  const c1 = receipt1.logs
    .map(l => { try { return committee.interface.parseLog(l as Log); } catch { return null; } })
    .find(e => e?.name === "ContributionReceived");
  if (!c1) throw new Error("expected ContributionReceived");
  log(
    `contribute1 tx: ${receipt1.hash} ${txLink(receipt1.hash)} required=${c1.args.required} refund=${c1.args.refund}`,
  );
  log(`HCS contribute1: ${await postHcs(receipt1.hash)}`);

  const [required2] = await committee.quoteContribution();
  const receipt2 = await (await committee.connect(member2).contribute({ value: valueFor(required2), gasLimit: CONTRIBUTE_GAS_LIMIT, gasPrice })).wait();
  if (!receipt2) throw new Error("contribute2 receipt missing");
  const c2 = receipt2.logs
    .map(l => { try { return committee.interface.parseLog(l as Log); } catch { return null; } })
    .find(e => e?.name === "ContributionReceived");
  if (!c2) throw new Error("expected ContributionReceived");
  log(
    `contribute2 tx: ${receipt2.hash} ${txLink(receipt2.hash)} required=${c2.args.required} refund=${c2.args.refund}`,
  );
  log(`HCS contribute2: ${await postHcs(receipt2.hash)}`);

  const potBefore = await committee.pot();
  const expectedPot = (c1.args.required as bigint) + (c2.args.required as bigint);
  log(`pot: ${potBefore} | required1+required2: ${expectedPot} | match: ${potBefore === expectedPot}`);
  if (potBefore !== expectedPot) throw new Error("unit math: pot != required1+required2");
  if (c1.args.refund !== 0n || c2.args.refund !== 0n) {
    throw new Error("unit math: expected zero refunds for exact quotes");
  }

  // --- wait for HSS to run finalizeRound, else fall back to manual ---
  const member1Before = await ethers.provider.getBalance(deployerAddress);
  const deadline = roundEndsAt + HSS_GRACE_SECONDS;
  log(`waiting for round end ${roundEndsAt}, HSS grace until ${deadline} (${HSS_GRACE_SECONDS}s)...`);

  let autoEvent: EventLog | null = null;
  while (autoEvent === null && Math.floor(Date.now() / 1000) < deadline) {
    const roundNow = await committee.round();
    if (roundNow > 1n) {
      for (let attempt = 0; attempt < 6 && autoEvent === null; attempt++) {
        const events = await committee.queryFilter(
          committee.filters.RoundFinalized(),
          Number(createReceipt.blockNumber ?? 0),
        );
        autoEvent = (events.at(-1) as EventLog | undefined) ?? null;
        if (autoEvent === null) await new Promise(resolve => setTimeout(resolve, 3000));
      }
      break;
    }
    await new Promise(resolve => setTimeout(resolve, POLL_SECONDS * 1000));
  }

  let finalizedPath: "hss" | "manual";
  let finalizeTxHash: string;
  let finalizeReceipt: TransactionReceipt | null = null;

  if (autoEvent !== null) {
    finalizedPath = "hss";
    finalizeTxHash = autoEvent.transactionHash;
    finalizeReceipt = await ethers.provider.getTransactionReceipt(finalizeTxHash);
    log(`HSS executed finalizeRound automatically (tx ${finalizeTxHash})`);
  } else {
    log(`HSS did not execute finalizeRound within ${HSS_GRACE_SECONDS}s of round end - calling manually`);
    const manualReceipt = await (await committee.finalizeRound({ gasPrice })).wait();
    if (!manualReceipt) throw new Error("manual finalize receipt missing");
    finalizedPath = "manual";
    finalizeTxHash = manualReceipt.hash;
    finalizeReceipt = manualReceipt;
    log(`manual finalize tx: ${finalizeTxHash} ${txLink(finalizeTxHash)}`);
  }

  const finalizedEvent = autoEvent ?? (await committee.queryFilter(committee.filters.RoundFinalized())).at(-1);
  if (!finalizedEvent) throw new Error("RoundFinalized not found");

  // --- unit math reconciliation ---
  const amount = finalizedEvent.args.amount as bigint;
  const member1After = await ethers.provider.getBalance(deployerAddress);
  const gasCost =
    finalizedPath === "manual" && finalizeReceipt ? finalizeReceipt.gasUsed * finalizeReceipt.gasPrice : 0n;
  const expectedDelta = amount * 10n ** 10n - gasCost;
  const measuredDelta = member1After - member1Before;
  const deltaMatch = measuredDelta === expectedDelta;
  log("--- unit math ---");
  log(`finalize path: ${finalizedPath.toUpperCase()}`);
  log(
    `RoundFinalized round=${finalizedEvent.args.round} receiver=${finalizedEvent.args.receiver} amount=${amount} tinybars contributors=${finalizedEvent.args.contributors} missed=${finalizedEvent.args.missed}`,
  );
  log(`payout amount == pot: ${amount === potBefore}`);
  log(`receiver == member1: ${finalizedEvent.args.receiver === deployerAddress}`);
  log(
    `member1 delta: measured ${measuredDelta} vs expected ${expectedDelta} (amount*1e10 - gas ${gasCost}) | match: ${deltaMatch}`,
  );
  if (amount !== potBefore) throw new Error("unit math: payout != pot");
  if (finalizedEvent.args.receiver !== deployerAddress) throw new Error("unit math: wrong receiver");

  log(`HCS finalize: ${await postHcs(finalizeTxHash)}`);

  // sweep member2's leftover gas buffer back
  const member2Left = await ethers.provider.getBalance(member2Address);
  const sweepGasBuffer = ethers.parseEther("0.1");
  if (member2Left > sweepGasBuffer) {
    const sweep = await member2.sendTransaction({
      to: deployerAddress,
      value: member2Left - sweepGasBuffer,
      gasPrice,
    });
    await sweep.wait();
    log(`member2 leftover returned: ${hbar(member2Left - sweepGasBuffer)} tx ${txLink(sweep.hash)}`);
  }

  log("=== summary ===");
  log(
    `HSS path: ${finalizedPath === "hss" ? "AUTO-EXECUTED by Hedera Schedule Service" : "MANUAL fallback (HSS did not fire)"}`,
  );
  log(`refund1=${c1.args.refund} refund2=${c2.args.refund} (exact-quote contributions)`);
  log(`pot=${potBefore} payout=${amount} tinybars | balance-delta check: ${deltaMatch ? "PASS" : "FAIL"}`);
  log(
    `HCS topic ${process.env.HCS_TOPIC_ID ?? "<unset>"} records: create/join1/join2/contribute1/contribute2/finalize`,
  );
  log(
    `links: committee ${HASHSCAN}/contract/${committeeAddress} | factory ${HASHSCAN}/contract/${factoryAddress} | finalize ${txLink(finalizeTxHash)}`,
  );
  if (!deltaMatch) {
    console.error("UNIT MATH FAIL: receiver balance delta did not match amount*1e10 - gas");
    process.exit(4);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

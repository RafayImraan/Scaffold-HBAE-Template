import { ethers, network } from "hardhat";
import { formatEther } from "ethers";

const MIRROR = "https://testnet.mirrornode.hedera.com/api/v1";

type AccountResponse = { account: string; balance: { balance: number } };

async function mirrorBalanceTinybars(evmAddress: string): Promise<{ accountId: string; tinybars: bigint }> {
  const res = await fetch(`${MIRROR}/accounts/${evmAddress}`);
  if (!res.ok) throw new Error(`No mirror-node account for ${evmAddress} - fund it first`);
  const detail = (await res.json()) as AccountResponse;
  return { accountId: detail.account, tinybars: BigInt(detail.balance.balance) };
}

async function main() {
  const onTestnet = network.name === "hederaTestnet";
  const [deployer] = await ethers.getSigners();
  const evm = await deployer.getAddress();
  const before = onTestnet ? await mirrorBalanceTinybars(evm) : null;
  const evmBalanceBefore = await ethers.provider.getBalance(evm);
  console.log(`network=${network.name} evm=${evm}`);
  if (before) console.log(`mirror tinybars before = ${before.tinybars} (${formatEther(before.tinybars * 10n ** 10n)} HBAR)`);
  console.log(`evm balance before     = ${evmBalanceBefore}`);

  const probe = await (await ethers.getContractFactory("ValueUnitProbe")).deploy();
  await probe.waitForDeployment();
  const probeAddress = await probe.getAddress();
  const deployReceipt = await probe.deploymentTransaction()!.wait();
  console.log(`probe=${probeAddress} deployTx=${deployReceipt?.hash}`);

  const afterDeploy = onTestnet ? await mirrorBalanceTinybars(evm) : null;
  if (afterDeploy && before)
    console.log(
      `mirror after deploy   = ${afterDeploy.tinybars} (delta ${afterDeploy.tinybars - before.tinybars} tinybars, gas)`,
    );

  const ONE = 10n ** 18n;
  const sendTx = await deployer.sendTransaction({ to: probeAddress, value: ONE });
  const sendReceipt = await sendTx.wait();
  console.log(`send 1 HBAR tx = ${sendReceipt?.hash} value sent (raw) = ${ONE}`);

  const msgValue = await probe.lastMsgValue();
  const contractBalance = await probe.balanceAfterReceive();
  const evmBalanceAfterSend = await ethers.provider.getBalance(evm);
  console.log(`contract msg.value  = ${msgValue}`);
  console.log(`contract balance    = ${contractBalance}`);
  if (afterDeploy) {
    const afterSend = await mirrorBalanceTinybars(evm);
    console.log(
      `mirror after send   = ${afterSend.tinybars} (delta ${afterSend.tinybars - afterDeploy.tinybars} tinybars for 1 HBAR)`,
    );
  }
  console.log(`evm balance after   = ${evmBalanceAfterSend}`);

  const payout = contractBalance / 10n;
  const beforePayoutMirror = onTestnet ? await mirrorBalanceTinybars(evm) : null;
  const payTx = await probe.payOut(evm, payout);
  const payReceipt = await payTx.wait();
  const gasUsed = payReceipt!.gasUsed * payReceipt!.gasPrice;
  console.log(`payout tx = ${payReceipt?.hash} payout raw = ${payout} (gasUsed*price ${gasUsed})`);
  console.log(`contract lastPayoutValue = ${await probe.lastPayoutValue()}`);
  if (beforePayoutMirror) {
    const afterPayoutMirror = await mirrorBalanceTinybars(evm);
    const mirrorDelta = afterPayoutMirror.tinybars - beforePayoutMirror.tinybars;
    console.log(
      `mirror after payout  = ${afterPayoutMirror.tinybars} (delta ${mirrorDelta} tinybars, net of gas ${
        mirrorDelta + gasUsed / 10n ** 10n
      } tinybars)`,
    );
  }

  console.log("\n--- summary ---");
  console.log(`sent raw (18-dec style) = ${ONE}`);
  console.log(`contract saw msg.value  = ${msgValue}`);
  console.log(`ratio sent/seen         = ${msgValue === 0n ? "n/a" : ONE / msgValue}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});

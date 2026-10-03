import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";

import type { Committee, CommitteeFactory } from "../typechain-types";

export const TINYBARS_PER_HBAR = 10n ** 8n;
export const WEI_PER_HBAR = 10n ** 18n;

/** Every amount-sensitive suite runs against both regimes (PLAN section 9). */
export const BOTH_UNITS: Array<[string, bigint]> = [
  ["tinybars (Hedera)", TINYBARS_PER_HBAR],
  ["wei (local)", WEI_PER_HBAR],
];

/** $20.00 in 1e-6 USD. */
export const USD_20 = 20_000_000n;

/** $0.10 per HBAR as priceE18 (USD-per-HBAR x 1e18). */
export const PRICE_10_CENTS = 10n ** 17n;

export type World = Awaited<ReturnType<typeof deployWorld>>;

export async function deployWorld(unitsPerHbar: bigint) {
  const [creator, alice, bob, carol, executor] = await ethers.getSigners();

  const oracle = await (await ethers.getContractFactory("MockPriceOracle")).deploy(PRICE_10_CENTS);
  const scheduleService = await (await ethers.getContractFactory("MockScheduleService")).deploy();
  // Use hssEnabled=true in tests to exercise HSS scheduling with MockScheduleService
  const hssEnabled = true;
  const factory = await (
    await ethers.getContractFactory("CommitteeFactory")
  ).deploy(await oracle.getAddress(), await scheduleService.getAddress(), hssEnabled, unitsPerHbar);

  return { creator, alice, bob, carol, executor, oracle, scheduleService, factory, unitsPerHbar };
}

export type CreateOptions = {
  usdPerRound?: bigint;
  maxMembers?: number;
  roundDuration?: bigint;
  maxPriceAge?: bigint;
  factory?: CommitteeFactory;
  creator?: HardhatEthersSigner;
};

export type CreatedCommittee = Awaited<ReturnType<typeof createCommittee>>;

export async function createCommittee(world: World, options: CreateOptions = {}) {
  const factory = options.factory ?? world.factory;
  const creator = options.creator ?? world.creator;
  const usdPerRound = options.usdPerRound ?? USD_20;
  const maxMembers = options.maxMembers ?? 3;
  const roundDuration = options.roundDuration ?? 3600n;
  const maxPriceAge = options.maxPriceAge ?? 86_400n;

  const reserve = await factory.minReserve();
  await factory
    .connect(creator)
    .createCommittee(usdPerRound, maxMembers, roundDuration, maxPriceAge, { value: reserve });

  const addresses = await factory.getCommittees();
  const committee = (await ethers.getContractAt("Committee", addresses[addresses.length - 1])) as Committee;
  return { committee, reserve, usdPerRound, maxMembers, roundDuration, maxPriceAge };
}

export async function joinAll(committee: Committee, joiners: HardhatEthersSigner[]) {
  for (const joiner of joiners) {
    await committee.connect(joiner).join();
  }
}

/** Native amount this round expects, in contract units. */
export async function requiredNative(committee: Committee): Promise<bigint> {
  const [required] = await committee.quoteContribution();
  return required;
}

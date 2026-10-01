import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const PAIR_HBAR_USD = ethers.keccak256(ethers.toUtf8Bytes("HBAR/USD"));
const OTHER_PAIR = ethers.keccak256(ethers.toUtf8Bytes("HBAR/USDC"));
const MAX_AGE = 86_400n;

async function deployAdapter(decimals: number, answer: bigint) {
  const feed = await (await ethers.getContractFactory("MockAggregatorV3")).deploy(decimals, answer);
  const adapter = await (
    await ethers.getContractFactory("ChainlinkHbarUsdAdapter")
  ).deploy(await feed.getAddress(), MAX_AGE);
  return { feed, adapter };
}

describe("ChainlinkHbarUsdAdapter", function () {
  it("normalizes an 8-decimal feed to priceE18", async function () {
    const { feed, adapter } = await deployAdapter(8, 123_456_789n); // $1.23456789
    const data = await adapter.latestPrice(PAIR_HBAR_USD);
    expect(data.pairKey).to.equal(PAIR_HBAR_USD);
    expect(data.priceE18).to.equal(123_456_789n * 10n ** 10n);
    expect(data.updatedAt).to.equal(await feed.updatedAt());
    expect(await adapter.feedDecimals()).to.equal(8n);
    expect(await adapter.maxPriceAge()).to.equal(MAX_AGE);
  });

  it("normalizes a feed with more than 18 decimals by division", async function () {
    const { adapter } = await deployAdapter(20, 5n * 10n ** 20n);
    expect((await adapter.latestPrice(PAIR_HBAR_USD)).priceE18).to.equal(5n * 10n ** 18n);
  });

  it("rejects other pairs", async function () {
    const { adapter } = await deployAdapter(8, 100_000_000n);
    await expect(adapter.latestPrice(OTHER_PAIR))
      .to.be.revertedWithCustomError(adapter, "OracleUnsupportedPair")
      .withArgs(OTHER_PAIR);
  });

  it("flags incomplete rounds", async function () {
    const { feed, adapter } = await deployAdapter(8, 100_000_000n);
    const now = BigInt(await time.latest());
    await feed.setRound(100_000_000n, now, 2, 1);
    await expect(adapter.latestPrice(PAIR_HBAR_USD))
      .to.be.revertedWithCustomError(adapter, "OracleIncompleteRound")
      .withArgs(2, 1);
  });

  it("flags zero and stale timestamps", async function () {
    const { feed, adapter } = await deployAdapter(8, 100_000_000n);
    const now = BigInt(await time.latest());
    await feed.setRound(100_000_000n, 0, 1, 1);
    await expect(adapter.latestPrice(PAIR_HBAR_USD))
      .to.be.revertedWithCustomError(adapter, "OracleStalePrice")
      .withArgs(0, MAX_AGE);

    await feed.setRound(100_000_000n, now - MAX_AGE - 1n, 1, 1);
    await expect(adapter.latestPrice(PAIR_HBAR_USD))
      .to.be.revertedWithCustomError(adapter, "OracleStalePrice")
      .withArgs(now - MAX_AGE - 1n, MAX_AGE);
  });

  it("flags zero and negative answers", async function () {
    const { feed, adapter } = await deployAdapter(8, 100_000_000n);
    const now = BigInt(await time.latest());
    await feed.setRound(0, now, 1, 1);
    await expect(adapter.latestPrice(PAIR_HBAR_USD)).to.be.revertedWithCustomError(adapter, "OracleInvalidPrice");
    await feed.setRound(-1, now, 1, 1);
    await expect(adapter.latestPrice(PAIR_HBAR_USD)).to.be.revertedWithCustomError(adapter, "OracleInvalidPrice");
  });

  it("rejects a zero feed address", async function () {
    const adapterFactory = await ethers.getContractFactory("ChainlinkHbarUsdAdapter");
    await expect(adapterFactory.deploy(ethers.ZeroAddress, MAX_AGE)).to.be.revertedWithCustomError(
      adapterFactory,
      "ZeroAddress",
    );
  });
});

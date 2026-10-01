import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { USD_20, WEI_PER_HBAR, createCommittee, deployWorld, joinAll, requiredNative } from "./fixtures";

describe("Committee.oracle", function () {
  it("matches the documented formula in both unit regimes", async function () {
    for (const unitsPerHbar of [10n ** 8n, WEI_PER_HBAR]) {
      const world = await deployWorld(unitsPerHbar);
      const { committee } = await createCommittee(world);
      // $20 at $0.10/HBAR = 200 HBAR, expressed in chain units.
      expect(await requiredNative(committee)).to.equal(200n * unitsPerHbar);
    }
  });

  it("reverts StalePrice when the quote is older than the committee's maxPriceAge", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { oracle, alice, bob, carol } = world;
    const { committee } = await createCommittee(world, { maxPriceAge: 3600n });
    await joinAll(committee, [alice, bob, carol]);

    const staleAt = BigInt(await time.latest()) - 3700n;
    await oracle.setUpdatedAt(staleAt);

    await expect(committee.quoteContribution())
      .to.be.revertedWithCustomError(committee, "StalePrice")
      .withArgs(staleAt, 3600n);
    // the error bubbles through contribute() untouched - nothing moves
    await expect(committee.connect(alice).contribute({ value: 1n }))
      .to.be.revertedWithCustomError(committee, "StalePrice")
      .withArgs(staleAt, 3600n);
  });

  it("reverts InvalidPrice on a zero price", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { oracle, alice, bob, carol } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    await oracle.setPrice(0n);
    await expect(committee.quoteContribution()).to.be.revertedWithCustomError(committee, "InvalidPrice");
    await expect(committee.connect(alice).contribute({ value: 1n })).to.be.revertedWithCustomError(
      committee,
      "InvalidPrice",
    );
  });

  it("bubbles an oracle that reverts", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { oracle, alice, bob, carol } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    await oracle.setRevertOnRead(true);
    await expect(committee.quoteContribution()).to.be.revertedWithCustomError(oracle, "MockOracleDown");
    await expect(committee.connect(alice).contribute({ value: 1n })).to.be.revertedWithCustomError(
      oracle,
      "MockOracleDown",
    );
  });

  it("ceil-rounds the USD conversion (never undercharges)", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { oracle } = world;
    const { committee } = await createCommittee(world);

    await oracle.setPrice(7n * 10n ** 16n); // $0.07 / HBAR
    const required = await requiredNative(committee);

    const numerator = USD_20 * 10n ** 12n * WEI_PER_HBAR;
    const price = 7n * 10n ** 16n;
    expect(required).to.equal(285_714_285_714_285_714_286n);
    expect(required * price).to.be.greaterThanOrEqual(numerator);
    expect((required - 1n) * price).to.be.lessThan(numerator);

    expect(await committee.usdToNative(0n)).to.equal(0n);
    expect(await committee.usdToNative(1_000_000n)).to.equal(
      (1_000_000n * 10n ** 12n * WEI_PER_HBAR + price - 1n) / price,
    );
  });

  it("reverts StalePrice for a price older than the adapter-agnostic bound even at $ price", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { oracle, alice, bob, carol } = world;
    const { committee } = await createCommittee(world, { maxPriceAge: 60n });
    await joinAll(committee, [alice, bob, carol]);

    await time.increase(61);
    await expect(committee.quoteContribution()).to.be.revertedWithCustomError(committee, "StalePrice");

    await oracle.setUpdatedAt(BigInt(await time.latest()));
    expect((await committee.quoteContribution())[0]).to.equal(200n * WEI_PER_HBAR);
  });
});

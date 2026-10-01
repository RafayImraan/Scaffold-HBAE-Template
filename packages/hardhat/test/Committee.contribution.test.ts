import { expect } from "chai";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { WEI_PER_HBAR, createCommittee, deployWorld, joinAll, requiredNative } from "./fixtures";

describe("Committee.contribution", function () {
  async function activeCommittee() {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol } = world;
    const created = await createCommittee(world);
    await joinAll(created.committee, [alice, bob, carol]);
    return { world, ...created };
  }

  it("rejects non-members", async function () {
    const { world, committee } = await activeCommittee();
    await expect(committee.connect(world.executor).contribute({ value: 1n })).to.be.revertedWithCustomError(
      committee,
      "NotMember",
    );
  });

  it("rejects contributions while the committee is still Open", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob } = world;
    const { committee } = await createCommittee(world, { maxMembers: 3 });
    await committee.connect(alice).join();
    await committee.connect(bob).join();
    expect(await committee.status()).to.equal(0n); // Open

    await expect(committee.connect(alice).contribute({ value: 1n })).to.be.revertedWithCustomError(
      committee,
      "NotActive",
    );
  });

  it("rejects a second contribution in the same round", async function () {
    const { world, committee } = await activeCommittee();
    const required = await requiredNative(committee);
    await committee.connect(world.alice).contribute({ value: required });

    await expect(committee.connect(world.alice).contribute({ value: required }))
      .to.be.revertedWithCustomError(committee, "AlreadyContributed")
      .withArgs(1n);
  });

  it("rejects payment after the round has closed", async function () {
    const { world, committee } = await activeCommittee();
    const required = await requiredNative(committee);
    const roundEnd = await committee.roundEndsAt();
    await time.increaseTo(roundEnd);

    await expect(committee.connect(world.alice).contribute({ value: required }))
      .to.be.revertedWithCustomError(committee, "RoundClosed")
      .withArgs(roundEnd);
  });

  it("rejects underpayment and zero value with the exact required amount", async function () {
    const { world, committee } = await activeCommittee();
    const required = await requiredNative(committee);

    await expect(committee.connect(world.alice).contribute({ value: required - 1n }))
      .to.be.revertedWithCustomError(committee, "InsufficientContribution")
      .withArgs(required, required - 1n);
    await expect(committee.connect(world.alice).contribute({ value: 0n }))
      .to.be.revertedWithCustomError(committee, "InsufficientContribution")
      .withArgs(required, 0n);
  });

  it("keeps exactly the required amount and refunds the overpay", async function () {
    const { world, committee, reserve } = await activeCommittee();
    const required = await requiredNative(committee);
    const overpay = 555n;

    const contributeTx = committee.connect(world.alice).contribute({ value: required + overpay });
    await expect(contributeTx).to.changeEtherBalance(world.alice, -required); // tx fee excluded by the matcher
    await expect(contributeTx).to.changeEtherBalance(committee, required);

    expect(await committee.pot()).to.equal(required);
    expect(await committee.contributedThisRound()).to.equal(required);
    expect(await committee.paidInRound(world.alice.address, 1n)).to.equal(true);
    expect(await committee.contributorsThisRound()).to.equal(1n);
    expect(await committee.getMembers()).to.have.lengthOf(3);
    expect(await world.oracle.priceE18()).to.equal(10n ** 17n);
    expect(reserve).to.equal(WEI_PER_HBAR / 2n);
  });
});

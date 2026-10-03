import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { WEI_PER_HBAR, createCommittee, deployWorld, joinAll, requiredNative } from "./fixtures";

describe("Committee.payout", function () {
  it("rejects finalize before the round ends", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    const roundEnd = await committee.roundEndsAt();
    await expect(committee.finalizeRound())
      .to.be.revertedWithCustomError(committee, "RoundNotEnded")
      .withArgs(roundEnd);
  });

  it("manual finalize deletes the pending schedule before starting the next round", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol, scheduleService } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    const firstSchedule = await committee.pendingSchedule();
    expect(firstSchedule).to.not.equal(ethers.ZeroAddress);

    await time.increaseTo(await committee.roundEndsAt());
    await expect(committee.connect(bob).finalizeRound()).to.emit(committee, "RoundFinalized");

    expect((await scheduleService.getSchedule(firstSchedule)).deleted).to.equal(true);
    expect(await committee.pendingSchedule()).to.not.equal(firstSchedule); // round 2 rescheduled
    expect(await committee.round()).to.equal(2n);
  });

  it("reports throttling via PayoutScheduleFailed and keeps the manual fallback usable", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol, scheduleService } = world;
    const { committee } = await createCommittee(world);

    await scheduleService.setCapacity(false);
    await committee.connect(alice).join();
    await committee.connect(bob).join();
    const lastJoin = committee.connect(carol).join();
    await expect(lastJoin).to.emit(committee, "PayoutScheduleFailed").withArgs(0n);

    expect(await committee.status()).to.equal(1n); // Active - the failed schedule did not brick anything
    expect(await committee.pendingSchedule()).to.equal(ethers.ZeroAddress);

    await time.increaseTo(await committee.roundEndsAt());
    await expect(committee.connect(alice).finalizeRound()).to.emit(committee, "RoundFinalized");
    expect(await committee.round()).to.equal(2n);
  });

  it("forwards the schedule service's status code on PayoutScheduleFailed", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol, scheduleService } = world;
    const { committee } = await createCommittee(world);

    await scheduleService.setFailScheduleCode(-7);
    await committee.connect(alice).join();
    await committee.connect(bob).join();
    await expect(committee.connect(carol).join()).to.emit(committee, "PayoutScheduleFailed").withArgs(-7n);
  });

  it("skips scheduling entirely when hssEnabled is false", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol } = world;
    const [deployer] = await ethers.getSigners();
    const bareFactory = await (
      await ethers.getContractFactory("CommitteeFactory")
    ).deploy(await world.oracle.getAddress(), ethers.ZeroAddress, false, WEI_PER_HBAR);

    const { committee } = await createCommittee(world, { factory: bareFactory, creator: deployer });
    await committee.connect(alice).join();
    await committee.connect(bob).join();
    await expect(committee.connect(carol).join()).to.emit(committee, "ScheduleSkipped");

    expect(await committee.pendingSchedule()).to.equal(ethers.ZeroAddress);
    await time.increaseTo(await committee.roundEndsAt());
    await expect(committee.connect(alice).finalizeRound()).to.emit(committee, "RoundFinalized");
  });

  it("records contributors and missed members in RoundFinalized", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol, executor, scheduleService } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    const required = await requiredNative(committee);
    await committee.connect(alice).contribute({ value: required });
    await committee.connect(carol).contribute({ value: required });

    await time.increaseTo(await committee.roundEndsAt());
    await expect(scheduleService.connect(executor).executeDueSchedule())
      .to.emit(committee, "RoundFinalized")
      .withArgs(1n, alice.address, required * 2n, 2n, 1n); // bob missed
    expect(await committee.roundPaid(1n)).to.equal(true);
  });

  it("topUpReserve rejects zero value and adds to the reserve", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { committee, reserve } = await createCommittee(world);

    await expect(committee.topUpReserve({ value: 0n })).to.be.revertedWithCustomError(committee, "ZeroAmount");
    await expect(committee.topUpReserve({ value: 123n }))
      .to.emit(committee, "ReserveToppedUp")
      .withArgs(world.creator.address, 123n);
    expect(await ethers.provider.getBalance(await committee.getAddress())).to.equal(reserve + 123n);
  });

  it("sweepReserve requires a completed committee", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, bob, carol } = world;
    const { committee } = await createCommittee(world);
    await joinAll(committee, [alice, bob, carol]);

    await expect(committee.connect(world.creator).sweepReserve()).to.be.revertedWithCustomError(
      committee,
      "NotComplete",
    );
  });
});

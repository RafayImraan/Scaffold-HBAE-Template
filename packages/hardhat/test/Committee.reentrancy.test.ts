import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { WEI_PER_HBAR, createCommittee, deployWorld, requiredNative } from "./fixtures";

describe("Committee.reentrancy", function () {
  it("blocks reentrancy into finalizeRound/contribute during payout and keeps rounds flowing", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { alice, executor, scheduleService } = world;
    const { committee } = await createCommittee(world, { maxMembers: 2 });

    const receiver = await (await ethers.getContractFactory("MaliciousReceiver")).deploy(await committee.getAddress());
    await receiver.joinCommittee(); // member #1, so round 1 pays the attacker contract
    await committee.connect(alice).join(); // last join starts the committee

    const required = await requiredNative(committee);
    await committee.connect(alice).contribute({ value: required });

    await receiver.setAttack(true);
    await time.increaseTo(await committee.roundEndsAt());
    await scheduleService.connect(executor).executeDueSchedule();

    expect(await receiver.reentrySucceeded()).to.equal(false); // guard held
    expect(await committee.round()).to.equal(2n);
    expect(await committee.status()).to.equal(1n); // Active
    expect(await committee.roundPaid(1n)).to.equal(true);
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.equal(required);

    // the committee is not bricked: round 2 completes normally
    await committee.connect(alice).contribute({ value: required });
    await receiver.contribute({ value: required });
    await time.increaseTo(await committee.roundEndsAt());
    await scheduleService.connect(executor).executeDueSchedule();
    expect(await committee.status()).to.equal(2n); // Completed
    expect(await committee.roundPaid(2n)).to.equal(true);
  });
});

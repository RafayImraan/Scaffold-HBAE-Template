import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

import { BOTH_UNITS, PRICE_10_CENTS, USD_20, createCommittee, deployWorld, joinAll, requiredNative } from "./fixtures";

const STATUS_OPEN = 0n;
const STATUS_ACTIVE = 1n;
const STATUS_COMPLETED = 2n;

describe("Committee.fullCycle", function () {
  for (const [label, unitsPerHbar] of BOTH_UNITS) {
    describe(`unitsPerHbar = ${label}`, function () {
      it("runs join -> 3 paid rounds -> payouts in join order -> Completed -> sweepReserve", async function () {
        const world = await deployWorld(unitsPerHbar);
        const { creator, alice, bob, carol, executor, scheduleService } = world;
        const { committee, reserve, roundDuration } = await createCommittee(world);

        expect(await committee.status()).to.equal(STATUS_OPEN);

        await expect(committee.connect(alice).join()).to.emit(committee, "MemberJoined").withArgs(alice.address, 1n);
        await expect(committee.connect(bob).join()).to.emit(committee, "MemberJoined").withArgs(bob.address, 2n);

        const startTx = await committee.connect(carol).join();
        await expect(startTx).to.emit(committee, "CommitteeStarted").withArgs(1n, anyValue);
        await expect(startTx).to.emit(committee, "PayoutScheduled").withArgs(anyValue, anyValue);

        expect(await committee.status()).to.equal(STATUS_ACTIVE);
        expect(await committee.round()).to.equal(1n);
        expect(await committee.pendingSchedule()).to.not.equal(ethers.ZeroAddress);
        expect(await scheduleService.scheduleCount()).to.equal(1n);

        const payers = [alice, bob, carol];
        const receivers = [alice, bob, carol];

        for (let roundIndex = 0; roundIndex < 3; roundIndex++) {
          const required = await requiredNative(committee);
          const roundNo = BigInt(roundIndex + 1);

          for (const payer of payers) {
            await expect(committee.connect(payer).contribute({ value: required }))
              .to.emit(committee, "ContributionReceived")
              .withArgs(roundNo, payer.address, PRICE_10_CENTS, USD_20, required, 0n);
          }
          expect(await committee.pot()).to.equal(required * 3n);
          expect(await committee.contributedThisRound()).to.equal(required * 3n);
          expect(await committee.contributorsThisRound()).to.equal(3n);

          const roundEnd = await committee.roundEndsAt();
          await time.increaseTo(roundEnd);
          const executeTx = scheduleService.connect(executor).executeDueSchedule();
          await expect(executeTx)
            .to.emit(committee, "RoundFinalized")
            .withArgs(roundNo, receivers[roundIndex].address, required * 3n, 3n, 0n);
          await expect(executeTx).to.changeEtherBalances([receivers[roundIndex]], [required * 3n]);

          expect(await committee.pot()).to.equal(0n);
          expect(await committee.contributorsThisRound()).to.equal(0n);
          expect(await committee.roundPaid(roundNo)).to.equal(true);

          if (roundIndex < 2) {
            // Absolute reset (never +=): next round ends a full duration after the finalize block.
            const receipt = await (await executeTx).wait();
            const finalizeBlock = await ethers.provider.getBlock(receipt!.blockNumber);
            expect(await committee.round()).to.equal(roundNo + 1n);
            expect(await committee.status()).to.equal(STATUS_ACTIVE);
            expect(await committee.roundEndsAt()).to.equal(BigInt(finalizeBlock!.timestamp) + roundDuration);
            expect(await committee.pendingSchedule()).to.not.equal(ethers.ZeroAddress);
            expect(await scheduleService.scheduleCount()).to.equal(BigInt(roundIndex + 2));
          }
        }

        expect(await committee.status()).to.equal(STATUS_COMPLETED);
        expect(await committee.getMembers()).to.deep.equal([alice.address, bob.address, carol.address]);

        // pot was fully paid out each round; only the HSS reserve remains
        expect(await ethers.provider.getBalance(await committee.getAddress())).to.equal(reserve);

        await expect(committee.connect(alice).sweepReserve()).to.be.revertedWithCustomError(committee, "NotCreator");
        await expect(committee.connect(creator).sweepReserve()).to.changeEtherBalance(creator, reserve);
        expect(await ethers.provider.getBalance(await committee.getAddress())).to.equal(0n);
        await expect(committee.connect(creator).sweepReserve()).to.be.revertedWithCustomError(committee, "ZeroAmount");
      });

      it("emits CommitteeCompleted when the last round pays out", async function () {
        const world = await deployWorld(unitsPerHbar);
        const { alice, bob, executor, scheduleService } = world;
        const { committee } = await createCommittee(world, { maxMembers: 2, roundDuration: 3600n });
        await joinAll(committee, [alice, bob]);

        const required = await requiredNative(committee);
        await committee.connect(alice).contribute({ value: required });
        await committee.connect(bob).contribute({ value: required });

        // round 1 of 2 pays alice, committee stays Active
        await time.increaseTo(await committee.roundEndsAt());
        await scheduleService.connect(executor).executeDueSchedule();
        expect(await committee.status()).to.equal(STATUS_ACTIVE);
        expect(await committee.round()).to.equal(2n);

        // round 2 of 2 pays bob and completes the committee
        await committee.connect(alice).contribute({ value: required });
        await committee.connect(bob).contribute({ value: required });
        await time.increaseTo(await committee.roundEndsAt());
        const finalTx = scheduleService.connect(executor).executeDueSchedule();
        await expect(finalTx)
          .to.emit(committee, "RoundFinalized")
          .withArgs(2n, bob.address, required * 2n, 2n, 0n);
        await expect(finalTx).to.emit(committee, "CommitteeCompleted");
        expect(await committee.status()).to.equal(STATUS_COMPLETED);
        expect(await scheduleService.scheduleCount()).to.equal(2n); // round 1 at start, round 2 from finalize
      });
    });
  }
});

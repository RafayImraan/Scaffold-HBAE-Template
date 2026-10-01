import { expect } from "chai";
import { ethers } from "hardhat";

import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

import { TINYBARS_PER_HBAR, USD_20, WEI_PER_HBAR, createCommittee, deployWorld } from "./fixtures";

describe("CommitteeFactory", function () {
  it("exposes shared config; minReserve is 0.5 HBAR in chain units", async function () {
    const tinybars = await deployWorld(TINYBARS_PER_HBAR);
    expect(await tinybars.factory.unitsPerHbar()).to.equal(TINYBARS_PER_HBAR);
    expect(await tinybars.factory.minReserve()).to.equal(TINYBARS_PER_HBAR / 2n);
    expect(await tinybars.factory.oracle()).to.equal(await tinybars.oracle.getAddress());
    expect(await tinybars.factory.scheduleService()).to.equal(await tinybars.scheduleService.getAddress());
    expect(await tinybars.factory.PAIR_KEY()).to.equal(ethers.keccak256(ethers.toUtf8Bytes("HBAR/USD")));

    const wei = await deployWorld(WEI_PER_HBAR);
    expect(await wei.factory.minReserve()).to.equal(WEI_PER_HBAR / 2n);
  });

  it("rejects each out-of-bounds createCommittee parameter", async function () {
    const world = await deployWorld(TINYBARS_PER_HBAR);
    const { factory, creator } = world;
    const reserve = await factory.minReserve();
    const valid = [USD_20, 3, 3600, 86_400] as const;

    const cases: Array<{ args: Array<bigint | number>; param: string }> = [
      { args: [999_999n, valid[1], valid[2], valid[3]], param: "usdAmountPerRound" },
      { args: [1_000_000_001n, valid[1], valid[2], valid[3]], param: "usdAmountPerRound" },
      { args: [valid[0], 1, valid[2], valid[3]], param: "maxMembers" },
      { args: [valid[0], 11, valid[2], valid[3]], param: "maxMembers" },
      { args: [valid[0], valid[1], 299, valid[3]], param: "roundDuration" },
      { args: [valid[0], valid[1], 30 * 24 * 3600 + 1, valid[3]], param: "roundDuration" },
      { args: [valid[0], valid[1], valid[2], 59], param: "maxPriceAge" },
      { args: [valid[0], valid[1], valid[2], 7 * 24 * 3600 + 1], param: "maxPriceAge" },
    ];

    for (const { args, param } of cases) {
      await expect(factory.connect(creator).createCommittee(args[0], args[1], args[2], args[3], { value: reserve }))
        .to.be.revertedWithCustomError(factory, "InvalidConfig")
        .withArgs(ethers.encodeBytes32String(param));
    }
  });

  it("requires the HSS reserve to be forwarded on create", async function () {
    const world = await deployWorld(TINYBARS_PER_HBAR);
    const reserve = await world.factory.minReserve();
    await expect(world.factory.createCommittee(USD_20, 3, 3600, 86_400, { value: reserve - 1n }))
      .to.be.revertedWithCustomError(world.factory, "ReserveTooLow")
      .withArgs(reserve, reserve - 1n);
  });

  it("registers the committee, emits CommitteeCreated and passes config through", async function () {
    const world = await deployWorld(TINYBARS_PER_HBAR);
    const { factory, creator, scheduleService } = world;

    const tx = await factory.createCommittee(USD_20, 3, 3600, 86_400, { value: await factory.minReserve() });
    await expect(tx)
      .to.emit(factory, "CommitteeCreated")
      .withArgs(0, anyValue, creator.address, USD_20, 3, 3600, 86_400);

    const addresses = await factory.getCommittees();
    expect(addresses).to.have.lengthOf(1);

    const committee = await ethers.getContractAt("Committee", addresses[0]);
    expect(await committee.creator()).to.equal(creator.address);
    expect(await committee.status()).to.equal(0n); // Open
    expect(await committee.unitsPerHbar()).to.equal(TINYBARS_PER_HBAR);
    expect(await committee.relayScale()).to.equal(10n ** 18n / TINYBARS_PER_HBAR);
    expect(await committee.usdAmountPerRound()).to.equal(USD_20);
    expect(await committee.maxMembers()).to.equal(3n);
    expect(await committee.roundDuration()).to.equal(3600n);
    expect(await committee.maxPriceAge()).to.equal(86_400n);
    expect(await committee.scheduleService()).to.equal(await scheduleService.getAddress());
    expect(await committee.getMembers()).to.deep.equal([]);
  });

  it("rejects a zero oracle and an unsupported unitsPerHbar", async function () {
    const [deployer] = await ethers.getSigners();
    const factoryFactory = await ethers.getContractFactory("CommitteeFactory");
    const scheduleService = await (await ethers.getContractFactory("MockScheduleService")).deploy();

    await expect(
      factoryFactory.deploy(ethers.ZeroAddress, await scheduleService.getAddress(), TINYBARS_PER_HBAR),
    ).to.be.revertedWithCustomError(factoryFactory, "ZeroAddress");
    await expect(factoryFactory.deploy(deployer.address, await scheduleService.getAddress(), 10n ** 17n))
      .to.be.revertedWithCustomError(factoryFactory, "InvalidConfig")
      .withArgs(ethers.encodeBytes32String("unitsPerHbar"));
  });

  it("createCommittee works via the fixture helper (registry grows)", async function () {
    const world = await deployWorld(WEI_PER_HBAR);
    const { committee } = await createCommittee(world);
    expect(await committee.unitsPerHbar()).to.equal(WEI_PER_HBAR);
    expect(await world.factory.getCommittees()).to.deep.equal([await committee.getAddress()]);
  });
});

import { expect } from "chai";

import {
  hbarToNative,
  nativeToHbar,
  relayScaleFromUnitsPerHbar,
  txValueFromNative,
} from "../../nextjs/utils/hbarUnits";

import { TINYBARS_PER_HBAR, WEI_PER_HBAR } from "./fixtures";

describe("hbarUnits (the shared conversion helper used by the frontend)", function () {
  it("tinybars regime: relayScale 1e10, tx value = required * 1e10", function () {
    expect(relayScaleFromUnitsPerHbar(TINYBARS_PER_HBAR)).to.equal(10n ** 10n);
    const required = 200n * TINYBARS_PER_HBAR; // 200 HBAR owed by the contract
    expect(txValueFromNative(required, TINYBARS_PER_HBAR)).to.equal(200_000_000_000_000_000_000n);
  });

  it("wei regime: relayScale 1, tx value unchanged", function () {
    expect(relayScaleFromUnitsPerHbar(WEI_PER_HBAR)).to.equal(1n);
    const required = 200n * WEI_PER_HBAR;
    expect(txValueFromNative(required, WEI_PER_HBAR)).to.equal(required);
  });

  it("keeps the identity unitsPerHbar * relayScale = 1e18 in both regimes", function () {
    for (const unitsPerHbar of [TINYBARS_PER_HBAR, WEI_PER_HBAR]) {
      expect(unitsPerHbar * relayScaleFromUnitsPerHbar(unitsPerHbar)).to.equal(10n ** 18n);
    }
  });

  it("floors display conversions", function () {
    expect(nativeToHbar(200n * TINYBARS_PER_HBAR + 99_999_999n, TINYBARS_PER_HBAR)).to.equal(200n);
    expect(hbarToNative(200n, TINYBARS_PER_HBAR)).to.equal(200n * TINYBARS_PER_HBAR);
    expect(hbarToNative(200n, WEI_PER_HBAR)).to.equal(200n * WEI_PER_HBAR);
  });

  it("rejects a non-positive unitsPerHbar", function () {
    expect(() => relayScaleFromUnitsPerHbar(0n)).to.throw("unitsPerHbar must be > 0");
    expect(() => txValueFromNative(1n, -1n)).to.throw("unitsPerHbar must be > 0");
  });
});

/**
 * Native-unit conversions for committee contributions.
 *
 * The contract works in chain-native EVM units (tinybars 1e8 on Hedera, wei 1e18
 * locally - see docs/RESEARCH.md section 9), but senders talk to the hashio RPC,
 * which divides tx `value` by `relayScale` before execution. Send
 * `txValueFromNative(required, unitsPerHbar)` and the contract sees `required`.
 */

export function relayScaleFromUnitsPerHbar(unitsPerHbar: bigint): bigint {
  if (unitsPerHbar <= 0n) {
    throw new Error("unitsPerHbar must be > 0");
  }
  return 10n ** 18n / unitsPerHbar;
}

export function txValueFromNative(requiredNative: bigint, unitsPerHbar: bigint): bigint {
  return requiredNative * relayScaleFromUnitsPerHbar(unitsPerHbar);
}

export function nativeToHbar(nativeAmount: bigint, unitsPerHbar: bigint): bigint {
  return nativeAmount / unitsPerHbar;
}

export function hbarToNative(hbar: bigint, unitsPerHbar: bigint): bigint {
  return hbar * unitsPerHbar;
}

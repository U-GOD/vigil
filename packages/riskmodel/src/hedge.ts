import { WAD } from "@vigil/sdk";

/**
 * Note quantity that hedges `inventoryValue` of the underlying.
 * Q = (kUp + kDn) * inventoryValue * coverage / WAD / WAD.
 * Symmetric caps with coverage = 1 reduce to Q = 2K·V.
 * A long hedge holds the DN leg: its payoff change cancels V·g inside the caps.
 */
export function sizeHedge(
  inventoryValue: bigint,
  kUp: bigint,
  kDn: bigint,
  coverage: bigint,
): bigint {
  if (inventoryValue < 0n || coverage < 0n) throw new Error("invalid hedge");
  if (kUp + kDn === 0n) throw new Error("InvalidCap");
  return (inventoryValue * (kUp + kDn) * coverage) / WAD / WAD;
}

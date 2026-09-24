import { WAD, splitUp } from "@vigil/sdk";

/** Anchor-implied UP value, plus a WAD premium clamped into [0, 1]. */
export function fairValueUp(
  anchorPrice: bigint,
  pClose: bigint,
  adj: bigint,
  kUp: bigint,
  kDn: bigint,
  convergencePremium: bigint,
): bigint {
  const model = splitUp(pClose, anchorPrice, adj, kUp, kDn);
  const shifted = model + convergencePremium;
  if (shifted < 0n) return 0n;
  if (shifted > WAD) return WAD;
  return shifted;
}

/** Complement of the anchor-implied split. The premium is not applied twice. */
export function fairValueDn(
  anchorPrice: bigint,
  pClose: bigint,
  adj: bigint,
  kUp: bigint,
  kDn: bigint,
): bigint {
  return WAD - splitUp(pClose, anchorPrice, adj, kUp, kDn);
}

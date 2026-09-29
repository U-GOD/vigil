import { WAD, neutralSplit, payoutDn, splitUp } from "@vigil/sdk";

export type GapStats = {
  count: number;
  mean: bigint | null;
  min: bigint | null;
  max: bigint | null;
  p05: bigint | null;
  p95: bigint | null;
  stdev: bigint | null;
};

export type PricePair = { pClose: bigint; pOpen: bigint };

export type CapSpec = { name: string; kUp: bigint; kDn: bigint };

export type SettlementSummary = {
  name: string;
  kUp: bigint;
  kDn: bigint;
  count: number;
  pinUp: number;
  pinDown: number;
  meanUp: bigint;
  meanDn: bigint;
  neutralUp: bigint;
  neutralDn: bigint;
  premiumOverNeutral: bigint;
  p95Dn: bigint;
  actuarialUnderwriter: bigint;
  loadedUnderwriter: bigint;
};

export type SpreadModel = {
  meanAdverse: bigint;
  meanResidual: bigint;
  remainingWad: bigint;
};

/** Caps in the first testnet ladder. Symmetric 5, 10, 15, 25, then 10/25 and 25/10. */
export const LADDER: readonly CapSpec[] = [
  { name: "5/5", kUp: 5n * 10n ** 16n, kDn: 5n * 10n ** 16n },
  { name: "10/10", kUp: 10n ** 17n, kDn: 10n ** 17n },
  { name: "15/15", kUp: 15n * 10n ** 16n, kDn: 15n * 10n ** 16n },
  { name: "25/25", kUp: 25n * 10n ** 16n, kDn: 25n * 10n ** 16n },
  { name: "10/25", kUp: 10n ** 17n, kDn: 25n * 10n ** 16n },
  { name: "25/10", kUp: 25n * 10n ** 16n, kDn: 10n ** 17n },
];

function isqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("negative");
  if (value < 2n) return value;
  let x = value;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}

/** Nearest-rank percentile. `sortedAsc` must already be ascending. `p` is in (0, 1]. */
export function percentileNearest(sortedAsc: readonly bigint[], p: number): bigint {
  if (sortedAsc.length === 0) throw new Error("empty sample");
  if (!(p > 0 && p <= 1)) throw new Error("bad percentile");
  const index = Math.ceil(p * sortedAsc.length) - 1;
  const value = sortedAsc[index];
  if (value === undefined) throw new Error("empty sample");
  return value;
}

/** Empty samples return nulls. A null is not a measured gap of zero. */
export function gapStats(gaps: readonly bigint[]): GapStats {
  if (gaps.length === 0) {
    return { count: 0, mean: null, min: null, max: null, p05: null, p95: null, stdev: null };
  }
  let sum = 0n;
  let min = gaps[0] ?? 0n;
  let max = min;
  for (const gap of gaps) {
    sum += gap;
    if (gap < min) min = gap;
    if (gap > max) max = gap;
  }
  const count = BigInt(gaps.length);
  const mean = sum / count;
  let squared = 0n;
  for (const gap of gaps) {
    const delta = gap - mean;
    squared += delta * delta;
  }
  const sorted = gaps.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    count: gaps.length,
    mean,
    min,
    max,
    p05: percentileNearest(sorted, 0.05),
    p95: percentileNearest(sorted, 0.95),
    stdev: isqrt(squared / count),
  };
}

/**
 * Counterfactual Closure Note settlement for one cap.
 * Premiums are sample statistics of `payoutDn`, not traded prices.
 * `premiumOverNeutral` is mean DN settlement minus the no-move split.
 * `actuarialUnderwriter` is the mean P&L of selling DN at that sample mean.
 * `loadedUnderwriter` is the mean P&L of selling DN at the sample 95th percentile.
 */
export function settleSample(pairs: readonly PricePair[], cap: CapSpec): SettlementSummary {
  if (pairs.length === 0) throw new Error("empty sample");
  const dnPayouts: bigint[] = [];
  let sumUp = 0n;
  let sumDn = 0n;
  let pinUp = 0;
  let pinDown = 0;
  for (const pair of pairs) {
    const sUp = splitUp(pair.pClose, pair.pOpen, WAD, cap.kUp, cap.kDn);
    const dn = payoutDn(WAD, sUp);
    dnPayouts.push(dn);
    sumUp += sUp;
    sumDn += dn;
    if (sUp === WAD) pinUp += 1;
    if (sUp === 0n) pinDown += 1;
  }
  const count = BigInt(pairs.length);
  const meanUp = sumUp / count;
  const meanDn = sumDn / count;
  const neutralUp = neutralSplit(cap.kUp, cap.kDn);
  const neutralDn = WAD - neutralUp;
  const sorted = dnPayouts.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const p95Dn = percentileNearest(sorted, 0.95);
  let actuarial = 0n;
  let loaded = 0n;
  for (const dn of dnPayouts) {
    actuarial += meanDn - dn;
    loaded += p95Dn - dn;
  }
  return {
    name: cap.name,
    kUp: cap.kUp,
    kDn: cap.kDn,
    count: pairs.length,
    pinUp,
    pinDown,
    meanUp,
    meanDn,
    neutralUp,
    neutralDn,
    premiumOverNeutral: meanDn - neutralDn,
    p95Dn,
    actuarialUnderwriter: actuarial / count,
    loadedUnderwriter: loaded / count,
  };
}

/**
 * Inventory-risk model, not an observed spread.
 * A long inventory's adverse move is max(-gap, 0). Full DN coverage at `kDn`
 * leaves max(-gap - kDn, 0). The half-spread is assumed proportional to that mean.
 * Returns null when the sample has no adverse move to scale.
 */
export function spreadCompression(gaps: readonly bigint[], kDn: bigint): SpreadModel | null {
  if (gaps.length === 0 || kDn < 0n) return null;
  let adverse = 0n;
  let residual = 0n;
  for (const gap of gaps) {
    const down = gap < 0n ? -gap : 0n;
    adverse += down;
    residual += down > kDn ? down - kDn : 0n;
  }
  if (adverse === 0n) return null;
  const count = BigInt(gaps.length);
  const meanAdverse = adverse / count;
  if (meanAdverse === 0n) return null;
  return {
    meanAdverse,
    meanResidual: residual / count,
    remainingWad: (residual * WAD) / adverse,
  };
}

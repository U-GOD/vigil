import { WAD } from "@vigil/sdk";

export type CapMid = { kUp: bigint; kDn: bigint; midUp: bigint };

export type TailPoint = { cap: bigint; probability: bigint };

export type Surface = {
  above: TailPoint[];
  below: TailPoint[];
  asymmetry: TailPoint[];
};

/** Implied gap g = mid·(kUp+kDn) − kDn, in WAD, from an UP mid. */
export function impliedGap(mid: CapMid): bigint {
  return (mid.midUp * (mid.kUp + mid.kDn)) / WAD - mid.kDn;
}

/**
 * Finite differences of implied gap.
 * Along a fixed kDn, ∂g/∂kUp = P(r > kUp).
 * Along a fixed kUp, −∂g/∂kDn = P(r < −kDn).
 * Along kUp = kDn = K, ∂g/∂K = P(r > K) − P(r < −K).
 */
export function extractSurface(mids: readonly CapMid[]): Surface {
  const above: TailPoint[] = [];
  const below: TailPoint[] = [];
  const asymmetry: TailPoint[] = [];
  const byDn = group(mids, (mid) => mid.kDn);
  for (const row of byDn.values()) {
    const sorted = [...row].sort((a, b) => (a.kUp < b.kUp ? -1 : 1));
    pushDiff(above, sorted, (mid) => mid.kUp, 1n);
  }
  const byUp = group(mids, (mid) => mid.kUp);
  for (const row of byUp.values()) {
    const sorted = [...row].sort((a, b) => (a.kDn < b.kDn ? -1 : 1));
    pushDiff(below, sorted, (mid) => mid.kDn, -1n);
  }
  const symmetric = mids.filter((mid) => mid.kUp === mid.kDn);
  const sorted = [...symmetric].sort((a, b) => (a.kUp < b.kUp ? -1 : 1));
  pushDiff(asymmetry, sorted, (mid) => mid.kUp, 1n);
  return { above, below, asymmetry };
}

function group(mids: readonly CapMid[], key: (mid: CapMid) => bigint): Map<bigint, CapMid[]> {
  const out = new Map<bigint, CapMid[]>();
  for (const mid of mids) {
    const id = key(mid);
    const list = out.get(id) ?? [];
    list.push(mid);
    out.set(id, list);
  }
  return out;
}

function pushDiff(
  into: TailPoint[],
  sorted: CapMid[],
  capOf: (mid: CapMid) => bigint,
  sign: bigint,
): void {
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const left = sorted[i];
    const right = sorted[i + 1];
    if (!left || !right) continue;
    const capLeft = capOf(left);
    const capRight = capOf(right);
    if (capRight === capLeft) continue;
    const delta = impliedGap(right) - impliedGap(left);
    const probability = (sign * delta * WAD) / (capRight - capLeft);
    into.push({ cap: capLeft, probability });
  }
}

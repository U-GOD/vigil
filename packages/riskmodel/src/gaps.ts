import { WAD } from "@vigil/sdk";

export type Regime = "earnings" | "none" | "macro";

export type GapObservation = {
  ticker: string;
  sessionId: number;
  gap: bigint;
  regime: Regime;
};

export type GapSummary = {
  ticker: string;
  regime: Regime | "all";
  count: number;
  mean: bigint;
  min: bigint;
  max: bigint;
};

/** Phase 10 supplies the rows. This only splits a real sample by regime. */
export function summarizeGaps(
  rows: readonly GapObservation[],
  ticker: string,
  regime: Regime | "all",
): GapSummary {
  const sample = rows.filter(
    (row) => row.ticker === ticker && (regime === "all" || row.regime === regime),
  );
  if (sample.length === 0) {
    return { ticker, regime, count: 0, mean: 0n, min: 0n, max: 0n };
  }
  let sum = 0n;
  let min = sample[0]?.gap ?? 0n;
  let max = min;
  for (const row of sample) {
    sum += row.gap;
    if (row.gap < min) min = row.gap;
    if (row.gap > max) max = row.gap;
  }
  return { ticker, regime, count: sample.length, mean: sum / BigInt(sample.length), min, max };
}

export function gapFromPrints(pClose: bigint, pOpen: bigint): bigint {
  if (pClose <= 0n || pOpen <= 0n) throw new Error("InvalidPrint");
  return ((pOpen - pClose) * WAD) / pClose;
}

export function tagEarnings(
  rows: readonly GapObservation[],
  earningsSessions: ReadonlySet<number>,
): GapObservation[] {
  return rows.map((row) =>
    earningsSessions.has(row.sessionId) ? { ...row, regime: "earnings" } : row,
  );
}

import { WAD } from "@vigil/sdk";
import { describe, expect, it } from "vitest";
import { LADDER, gapStats, percentileNearest, settleSample, spreadCompression } from "../src/backtest.js";

const K10 = WAD / 10n;

describe("backtest statistics", () => {
  it("returns nulls for an empty sample", () => {
    expect(gapStats([])).toEqual({
      count: 0,
      mean: null,
      min: null,
      max: null,
      p05: null,
      p95: null,
      stdev: null,
    });
  });

  it("uses the nearest rank for the tails", () => {
    const gaps = [1n, 2n, 3n, 4n];
    expect(percentileNearest(gaps, 0.05)).toBe(1n);
    expect(percentileNearest(gaps, 0.95)).toBe(4n);
    expect(percentileNearest(gaps, 1)).toBe(4n);
    const stats = gapStats(gaps);
    expect(stats.mean).toBe(2n);
    expect(stats.min).toBe(1n);
    expect(stats.max).toBe(4n);
    expect(stats.stdev).toBe(1n);
  });

  it("settles through the capped split", () => {
    const cap = LADDER[1];
    expect(cap?.name).toBe("10/10");
    if (!cap) return;
    const summary = settleSample(
      [
        { pClose: 100n * WAD, pOpen: 120n * WAD },
        { pClose: 100n * WAD, pOpen: 80n * WAD },
        { pClose: 100n * WAD, pOpen: 100n * WAD },
      ],
      cap,
    );
    expect(summary.pinUp).toBe(1);
    expect(summary.pinDown).toBe(1);
    expect(summary.meanDn).toBe(WAD / 2n);
    expect(summary.premiumOverNeutral).toBe(0n);
    expect(summary.p95Dn).toBe(WAD);
    expect(summary.loadedUnderwriter).toBe(WAD / 2n);
    expect(summary.actuarialUnderwriter).toBe(0n);
  });

  it("scales residual downside by the cap", () => {
    const model = spreadCompression([-WAD / 5n, -WAD / 20n, 0n], K10);
    expect(model).toEqual({
      meanAdverse: WAD / 12n,
      meanResidual: WAD / 30n,
      remainingWad: (2n * WAD) / 5n,
    });
    expect(spreadCompression([WAD / 10n], K10)).toBeNull();
  });
});

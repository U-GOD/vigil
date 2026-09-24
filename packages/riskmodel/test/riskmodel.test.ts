import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WAD, neutralSplit, payoutDn, splitUp } from "@vigil/sdk";
import { describe, expect, it } from "vitest";
import { noArbBand, outsideBand } from "../src/band.js";
import { fairValueDn, fairValueUp } from "../src/fairValue.js";
import { gapFromPrints, summarizeGaps, tagEarnings } from "../src/gaps.js";
import { sizeHedge } from "../src/hedge.js";
import { extractSurface } from "../src/surface.js";

const K10 = WAD / 10n;
const K25 = (WAD * 25n) / 100n;

describe("fair value", () => {
  it("prices the UP note at the anchor-implied split", () => {
    const pClose = 100n * WAD;
    const anchor = 105n * WAD;
    expect(fairValueUp(anchor, pClose, WAD, K10, K10, 0n)).toBe(
      splitUp(pClose, anchor, WAD, K10, K10),
    );
    expect(fairValueDn(anchor, pClose, WAD, K10, K10)).toBe(
      WAD - splitUp(pClose, anchor, WAD, K10, K10),
    );
  });

  it("clamps a convergence premium into the unit interval", () => {
    expect(fairValueUp(100n * WAD, 100n * WAD, WAD, K10, K10, WAD)).toBe(WAD);
  });

  it("builds a band around fair value from the taker fee", () => {
    const fair = fairValueUp(100n * WAD, 100n * WAD, WAD, K10, K10, 0n);
    const band = noArbBand(fair, 7000n, 0n, 0n);
    expect(band.low).toBeLessThan(fair);
    expect(band.high).toBeGreaterThan(fair);
    expect(outsideBand(fair, band)).toBe("inside");
    expect(outsideBand(band.low - 1n, band)).toBe("below");
  });
});

describe("hedge", () => {
  it("matches the symmetric 2K·V size and the Solidity residual", () => {
    const inventory = 1_000_000_000n;
    const q = sizeHedge(inventory, K10, K10, WAD);
    expect(q).toBe(200_000_000n);
    const pClose = 100n * WAD;
    const pOpen = 105n * WAD;
    const sUp = splitUp(pClose, pOpen, WAD, K10, K10);
    const s0 = neutralSplit(K10, K10);
    const stock = (inventory * ((pOpen - pClose) * WAD / pClose)) / WAD;
    const hedge = (q * (sUp - s0)) / WAD;
    expect(stock - hedge).toBe(0n);
    expect(payoutDn(q, sUp) + payoutDn(q, s0)).toBeGreaterThan(0n);
  });
});

describe("surface", () => {
  it("recovers a point mass above the lower cap", () => {
    const wide = WAD;
    const r = WAD / 5n;
    const mid = (kUp: bigint) => {
      const g = r > kUp ? kUp : r;
      return ((g + wide) * WAD) / (kUp + wide);
    };
    const surface = extractSurface([
      { kUp: K10, kDn: wide, midUp: mid(K10) },
      { kUp: r, kDn: wide, midUp: mid(r) },
    ]);
    const point = surface.above[0];
    expect(point?.cap).toBe(K10);
    expect(point?.probability).toBe(WAD);
  });
});

describe("gaps", () => {
  it("splits a sample into earnings and non-earnings", () => {
    const rows = tagEarnings(
      [
        { ticker: "NVDA", sessionId: 20260923, gap: gapFromPrints(100n * WAD, 110n * WAD), regime: "none" },
        { ticker: "NVDA", sessionId: 20260924, gap: gapFromPrints(100n * WAD, 90n * WAD), regime: "none" },
      ],
      new Set([20260923]),
    );
    const earnings = summarizeGaps(rows, "NVDA", "earnings");
    const quiet = summarizeGaps(rows, "NVDA", "none");
    expect(earnings.count).toBe(1);
    expect(earnings.mean).toBe(WAD / 10n);
    expect(quiet.count).toBe(1);
    expect(quiet.mean).toBe(-WAD / 10n);
  });
});

describe("calendar agreement", () => {
  it("uses the same 12-month seed the registry script writes", () => {
    const file = join(
      dirname(fileURLToPath(import.meta.url)),
      "../../../contracts/script/data/xnys-sessions.json",
    );
    const seeded = JSON.parse(readFileSync(file, "utf8")) as { count: number };
    expect(seeded.count).toBe(252);
  });
});

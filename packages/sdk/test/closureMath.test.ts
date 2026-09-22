import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { marketId, mintIn, neutralSplit, payoutDn, payoutUp, splitUp, WAD } from "../src/closureMath.js";

type Vector = {
  name: string;
  pClose: string;
  pOpen: string;
  adj: string;
  kUp: string;
  kDn: string;
  sUp: string;
};

const dir = dirname(fileURLToPath(import.meta.url));
const vectors: Vector[] = JSON.parse(readFileSync(join(dir, "vectors/splitUp.json"), "utf8"));

type Generated = { count: string; cases: Omit<Vector, "name">[] };

describe("splitUp vectors", () => {
  for (const v of vectors) {
    it(v.name, () => {
      expect(
        splitUp(BigInt(v.pClose), BigInt(v.pOpen), BigInt(v.adj), BigInt(v.kUp), BigInt(v.kDn)).toString(),
      ).toBe(v.sUp);
    });
  }
});

describe("closureMath properties", () => {
  it("neutral split matches no-move split", () => {
    const kUp = 10n ** 17n;
    const kDn = 2n * 10n ** 17n;
    expect(neutralSplit(kUp, kDn)).toBe(splitUp(100n * WAD, 100n * WAD, WAD, kUp, kDn));
  });

  it("payouts never exceed the note amount", () => {
    const sUp = 666666666666666666n;
    const n = 1_000_000n;
    expect(payoutUp(n, sUp) + payoutDn(n, sUp)).toBeLessThanOrEqual(n);
  });

  it("marketId is stable for a fixed tuple", () => {
    const ticker = "0x27ae5ba08af46340c7dfef696b3c9f24386e916a0b243c3d540e0d16e4585405" as const;
    const a = marketId(ticker, 1n, 10n ** 17n, 10n ** 17n, "0x0000000000000000000000000000000000000001");
    const b = marketId(ticker, 1n, 10n ** 17n, 10n ** 17n, "0x0000000000000000000000000000000000000001");
    expect(a).toBe(b);
    expect(a).not.toBe(marketId(ticker, 2n, 10n ** 17n, 10n ** 17n, "0x0000000000000000000000000000000000000001"));
  });

  it("mint fee is charged on top", () => {
    const { requiredIn, backing } = mintIn(1_000_000n, 3n);
    expect(backing).toBe(1_000_000n);
    expect(requiredIn).toBe(1_000_300n);
  });
});

describe("generated splitUp vectors", () => {
  const generated: Generated = JSON.parse(
    readFileSync(join(dir, "vectors/splitUp.generated.json"), "utf8"),
  );

  it("has the recorded count", () => {
    expect(generated.cases.length).toBe(Number(generated.count));
  });

  it("matches splitUp for every case", () => {
    for (const v of generated.cases) {
      expect(splitUp(BigInt(v.pClose), BigInt(v.pOpen), BigInt(v.adj), BigInt(v.kUp), BigInt(v.kDn)).toString()).toBe(
        v.sUp,
      );
    }
  });
});

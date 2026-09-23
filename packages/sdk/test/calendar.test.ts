import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSessions, etToUnix } from "../scripts/sessions.mjs";

type Session = {
  id: number;
  closeTs: number;
  openTs: number;
  fallbackDeadline: number;
  printBandSecs: number;
  early: boolean;
};

const file = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../contracts/script/data/xnys-sessions.json",
);
const seeded = JSON.parse(readFileSync(file, "utf8")) as { count: number; sessions: Session[] };

describe("XNYS calendar", () => {
  const built = buildSessions();

  it("matches the committed seed", () => {
    expect(seeded.count).toBe(built.length);
    expect(seeded.sessions).toEqual(built);
  });

  it("skips Thanksgiving 2026 and Christmas, and marks the half-days", () => {
    const ids = new Set(built.map((s) => s.id));
    expect(ids.has(20261126)).toBe(false);
    expect(ids.has(20261225)).toBe(false);
    expect(ids.has(20270906)).toBe(false);
    expect(built.find((s) => s.id === 20261127)?.early).toBe(true);
    expect(built.find((s) => s.id === 20261224)?.early).toBe(true);
  });

  it("uses the 16:00 and 09:30 New York prints", () => {
    const wed = built.find((s) => s.id === 20260923);
    expect(wed?.closeTs).toBe(1790193600);
    expect(wed?.closeTs).toBe(etToUnix(2026, 9, 23, 16, 0));
    expect(wed?.openTs).toBe(etToUnix(2026, 9, 24, 9, 30));
    const friday = built.find((s) => s.id === 20260925);
    expect(friday?.openTs).toBe(etToUnix(2026, 9, 28, 9, 30));
    const early = built.find((s) => s.id === 20261127);
    expect(early?.closeTs).toBe(etToUnix(2026, 11, 27, 13, 0));
  });

  it("keeps every window ordered", () => {
    for (const s of built) {
      expect(s.closeTs).toBeLessThan(s.openTs);
      expect(s.openTs).toBeLessThan(s.fallbackDeadline);
      expect(s.printBandSecs).toBe(1800);
    }
  });
});

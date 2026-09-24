import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSessions, etToUnix } from "../src/index.js";
import { usdToWad } from "../src/price.js";
import { createHermes } from "../src/hermes.js";

const file = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../contracts/script/data/xnys-sessions.json",
);
const seeded = JSON.parse(readFileSync(file, "utf8")) as { count: number; sessions: unknown[] };

describe("calendar", () => {
  it("matches the session seed used onchain", () => {
    const built = buildSessions();
    expect(seeded.count).toBe(built.length);
    expect(seeded.sessions).toEqual(built);
    expect(etToUnix(2026, 9, 23, 16, 0)).toBe(1790193600);
  });
});

describe("prices", () => {
  it("converts a USD quote to WAD", () => {
    expect(usdToWad(225.51)).toBe(225_510_000_000_000_000_000n);
  });

  it("refuses a Hermes price when the update endpoint is unauthorized", async () => {
    await expect(createHermes().getQuote("NVDA", Date.now())).rejects.toThrow(/401/);
  });
});

import { describe, expect, it } from "vitest";
import { anchorDecision } from "../src/anchor.js";
import { lifecycleBatch } from "../src/lifecycle.js";
import { pythReportIntent, reporterIntent } from "../src/reporter.js";
import { spotIntent } from "../src/spot.js";
import { vaultQuote } from "../src/vaultKeeper.js";

const wad = 10n ** 18n;
const k = wad / 10n;

describe("reporter", () => {
  const session = { sessionId: 20260923, closeTs: 1_000, openTs: 2_000, printBandSecs: 100 };

  it("submits a sourced print inside the band", () => {
    const intent = reporterIntent("NVDA", session, "close", 1_050, {
      price: 100n * wad,
      timestampMs: 1_000_000,
      source: "yahoo-chart",
    });
    expect(intent?.source).toBe("yahoo-chart");
    expect(intent?.price).toBe(100n * wad);
  });

  it("stays quiet outside the band and rejects an empty Pyth update", () => {
    expect(
      reporterIntent("NVDA", session, "close", 1_200, {
        price: 100n * wad,
        timestampMs: 1,
        source: "yahoo-chart",
      }),
    ).toBeNull();
    expect(() => pythReportIntent("0x")).toThrow(/empty/);
  });
});

describe("spot", () => {
  it("refuses an unverified book and cancels a stale reference", () => {
    expect(
      spotIntent({
        verified: false,
        nowMs: 10,
        staleMs: 5,
        spreadBps: 20n,
        reference: { price: wad, timestampMs: 10, source: "coingecko-xstock" },
        lastReference: 0n,
        moveBps: 1n,
      }).action,
    ).toBe("refuse");
    expect(
      spotIntent({
        verified: true,
        nowMs: 100_000,
        staleMs: 1_000,
        spreadBps: 20n,
        reference: { price: wad, timestampMs: 1, source: "jupiter-xstock" },
        lastReference: wad,
        moveBps: 1n,
      }).action,
    ).toBe("cancel");
  });
});

describe("anchor", () => {
  it("halts on divergence and pair-burns when the legs sum above one", () => {
    const base = {
      bound: true,
      spotMid: 100n * wad,
      reference: 100n * wad,
      divergenceBps: 50n,
      pClose: 100n * wad,
      adj: wad,
      kUp: k,
      kDn: k,
      inventory: 0n,
      inventoryLimit: 10n,
      sessionLoss: 0n,
      lossCap: 10n,
      takerFee: 0n,
    };
    expect(
      anchorDecision({
        ...base,
        reference: 100n * wad,
        spotMid: 110n * wad,
        bookUp: { bid: 0n, ask: 0n },
        bookDn: { bid: 0n, ask: 0n },
      }).reason,
    ).toBe("anchor divergence");
    const burn = anchorDecision({
      ...base,
      bookUp: { bid: (wad * 6n) / 10n, ask: (wad * 7n) / 10n },
      bookDn: { bid: (wad * 6n) / 10n, ask: (wad * 7n) / 10n },
    });
    expect(burn.path).toBe("pair-burn");
  });

  it("refuses an unbound market", () => {
    expect(
      anchorDecision({
        bound: false,
        spotMid: wad,
        reference: wad,
        divergenceBps: 50n,
        pClose: wad,
        adj: wad,
        kUp: k,
        kDn: k,
        bookUp: { bid: 1n, ask: 1n },
        bookDn: { bid: 1n, ask: 1n },
        inventory: 0n,
        inventoryLimit: 1n,
        sessionLoss: 0n,
        lossCap: 1n,
        takerFee: 0n,
      }).reason,
    ).toBe("market is not bound");
  });
});

describe("vault", () => {
  it("quotes the down leg inside the ticker cap", () => {
    const quote = vaultQuote({
      bound: true,
      excluded: false,
      alreadyQuoted: false,
      ticker: "NVDA",
      marketId: "0x1",
      nav: 1_000_000_000n,
      tickerCapBps: 250n,
      inventoryValue: 1_000_000_000n,
      kUp: k,
      kDn: k,
      coverage: wad,
      anchor: 100n * wad,
      pClose: 100n * wad,
      adj: wad,
      premium: wad / 100n,
    });
    expect(quote?.leg).toBe("dn");
    expect(quote?.pairs).toBe(25_000_000n);
  });

  it("refuses an unbound market", () => {
    expect(() =>
      vaultQuote({
        bound: false,
        excluded: false,
        alreadyQuoted: false,
        ticker: "NVDA",
        marketId: "0x1",
        nav: 1n,
        tickerCapBps: 250n,
        inventoryValue: 1n,
        kUp: k,
        kDn: k,
        coverage: wad,
        anchor: wad,
        pClose: wad,
        adj: wad,
        premium: 0n,
      }),
    ).toThrow(/not bound/);
  });
});

describe("lifecycle", () => {
  it("halts, finalizes, and alerts without repeating a finished market", () => {
    const actions = lifecycleBatch([
      {
        marketId: "a",
        state: "trading",
        nowSec: 200,
        openTs: 100,
        fallbackDeadline: 300,
        printsFinal: false,
      },
      {
        marketId: "b",
        state: "halted",
        nowSec: 150,
        openTs: 100,
        fallbackDeadline: 300,
        printsFinal: true,
      },
      {
        marketId: "c",
        state: "halted",
        nowSec: 400,
        openTs: 100,
        fallbackDeadline: 300,
        printsFinal: false,
      },
      {
        marketId: "d",
        state: "finalized",
        nowSec: 400,
        openTs: 100,
        fallbackDeadline: 300,
        printsFinal: true,
      },
    ]);
    expect(actions.map((row) => row.action)).toEqual(["halt", "finalize", "fallback", "skip"]);
    expect(actions[2]?.alert).toBe(true);
  });
});

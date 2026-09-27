import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import {
  WAD,
  marketId,
  mintIn,
  payoutDn,
  payoutUp,
} from "@vigil/sdk";
import { collateralHeld, noteBalances, snapshot, type LogEvent } from "../src/index.js";
import { compareBalances, liveReconcileReady } from "../src/reconcile.js";

const alice = "0x1111111111111111111111111111111111111111";
const bob = "0x2222222222222222222222222222222222222222";
const collateral = "0x3333333333333333333333333333333333333333";
const noteUp = "0x4444444444444444444444444444444444444444";
const noteDn = "0x5555555555555555555555555555555555555555";
const noteUpWide = "0x8888888888888888888888888888888888888888";
const noteDnWide = "0x9999999999999999999999999999999999999999";
const bookUp = "0x6666666666666666666666666666666666666666";
const bookDn = "0x7777777777777777777777777777777777777777";
const bookUpWide = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const zero = "0x0000000000000000000000000000000000000000";
const ticker = stringToHex("NVDA", { size: 32 });
const sessionId = 20_260_923n;
const k = WAD / 10n;
const kWide = (WAD * 25n) / 100n;
const id = marketId(ticker, sessionId, k, k, collateral);
const wideId = marketId(ticker, sessionId, kWide, k, collateral);

function packLevel(level: {
  price: bigint;
  size: bigint;
  orderId: bigint;
  flags: number;
}): string {
  let word = 0n;
  word |= 1n << 216n;
  word |= 1n << 208n;
  word |= BigInt(level.flags) << 200n;
  word |= level.price << 168n;
  word |= level.size << 72n;
  word |= level.orderId << 8n;
  return `${word.toString(16).padStart(64, "0")}00000000000000`;
}

function packBook(
  bid: { price: bigint; size: bigint },
  ask: { price: bigint; size: bigint },
): string {
  return `0x${packLevel({ ...bid, orderId: 1n, flags: 129 })}${packLevel({ ...ask, orderId: 2n, flags: 128 })}`;
}

function log(): LogEvent[] {
  let n = 0;
  const ev = (
    contract: string,
    event: string,
    address: string,
    args: Record<string, string>,
    blockNumber = 10,
  ): LogEvent => {
    n += 1;
    return { contract, event, address, args, blockNumber, logIndex: n };
  };
  const pairs = 1_000_000n;
  const paid = mintIn(pairs, 0n);
  const sUp = WAD / 2n;
  const aliceUpLeft = 500_000n;
  const aliceDnLeft = 900_000n;
  const payout =
    payoutUp(aliceUpLeft, sUp) + payoutDn(aliceDnLeft, sUp);
  return [
    ev("SessionRegistry", "SessionStored", zero, {
      sessionId: sessionId.toString(),
      exchange: stringToHex("XNYS", { size: 32 }),
      closeTs: "1790193600",
      openTs: "1790276400",
      fallbackDeadline: "1790362800",
      printBandSecs: "300",
    }),
    ev("ClosureMarketFactory", "MarketCreated", zero, {
      marketId: id,
      ticker,
      sessionId: sessionId.toString(),
      kUp: k.toString(),
      kDn: k.toString(),
      collateral,
      noteUp,
      noteDn,
      creator: alice,
    }),
    ev("SettlementEngine", "MarketRegistered", zero, {
      marketId: id,
      ticker,
      sessionId: sessionId.toString(),
      kUp: k.toString(),
      kDn: k.toString(),
    }),
    ev("ClosureVault", "Minted", zero, {
      marketId: id,
      to: alice,
      pairs: pairs.toString(),
      paid: paid.requiredIn.toString(),
      fee: "0",
    }),
    ev("ClosureNote", "Transfer", noteUp, { from: zero, to: alice, value: pairs.toString() }),
    ev("ClosureNote", "Transfer", noteDn, { from: zero, to: alice, value: pairs.toString() }),
    ev("ClosureNote", "Transfer", noteUp, { from: alice, to: bob, value: "400000" }),
    ev("ClosureVault", "Burned", zero, { marketId: id, from: alice, pairs: "100000" }),
    ev("ClosureNote", "Transfer", noteUp, { from: alice, to: zero, value: "100000" }),
    ev("ClosureNote", "Transfer", noteDn, { from: alice, to: zero, value: "100000" }),
    ev("KuruListingAdapter", "ListingBound", zero, { marketId: id, bookUp, bookDn }),
    ev("KuruOrderBook", "BookUpdatesPacked", bookUp, {
      accountId: "1",
      executor: alice,
      clientOrderId: stringToHex("cover", { size: 32 }),
      packedUpdates: packBook({ price: 400_000n, size: 1_000_000n }, { price: 600_000n, size: 2_000_000n }),
    }),
    ev("ClosureMarketFactory", "MarketCreated", zero, {
      marketId: wideId,
      ticker,
      sessionId: sessionId.toString(),
      kUp: kWide.toString(),
      kDn: k.toString(),
      collateral,
      noteUp: noteUpWide,
      noteDn: noteDnWide,
      creator: alice,
    }),
    ev("SettlementEngine", "MarketRegistered", zero, {
      marketId: wideId,
      ticker,
      sessionId: sessionId.toString(),
      kUp: kWide.toString(),
      kDn: k.toString(),
    }),
    ev("KuruListingAdapter", "ListingBound", zero, {
      marketId: wideId,
      bookUp: bookUpWide,
      bookDn: noteDnWide,
    }),
    ev("KuruOrderBook", "BookUpdatesPacked", bookUpWide, {
      accountId: "1",
      executor: alice,
      clientOrderId: stringToHex("wide", { size: 32 }),
      packedUpdates: packBook({ price: 450_000n, size: 1_000_000n }, { price: 550_000n, size: 1_000_000n }),
    }),
    ev("PrintOracle", "PrintFinalized", zero, {
      ticker,
      sessionId: sessionId.toString(),
      kind: "0",
      price: "100",
    }),
    ev("PrintOracle", "PrintFinalized", zero, {
      ticker,
      sessionId: sessionId.toString(),
      kind: "1",
      price: "110",
    }),
    ev("SettlementEngine", "Finalized", zero, {
      marketId: id,
      sUp: sUp.toString(),
      fallbackSettle: "false",
    }, 11),
    ev("ClosureVault", "Redeemed", zero, {
      marketId: id,
      to: alice,
      upAmt: aliceUpLeft.toString(),
      dnAmt: aliceDnLeft.toString(),
      payout: payout.toString(),
    }, 12),
    ev("ClosureNote", "Transfer", noteUp, { from: alice, to: zero, value: aliceUpLeft.toString() }, 12),
    ev("ClosureNote", "Transfer", noteDn, { from: alice, to: zero, value: aliceDnLeft.toString() }, 12),
    ev("UnderwritingVault", "PremiumRecorded", zero, { ticker, amount: "25" }, 12),
  ];
}

describe("reducer", () => {
  const events = log();

  it("keeps note balances and vault collateral on the same accounting", () => {
    const view = snapshot(events);
    const tight = view.markets.find((row) => row.marketId === id.toLowerCase());
    expect(tight?.state).toBe("Finalized");
    expect(tight?.collateralHeld).toBe("200000");
    expect(tight?.midUp).toBe((WAD / 2n).toString());
    expect(tight?.depthBid).toBe("1000000");
    expect(tight?.depthAsk).toBe("2000000");
    expect(tight?.tradeCount).toBe(0);
    const bobUp = view.positions.find((row) => row.account === bob);
    expect(bobUp).toEqual({ account: bob, marketId: id.toLowerCase(), up: "400000", dn: "0" });
    const balances = noteBalances(events);
    const up = balances.filter((row) => row.leg === "up").reduce((sum, row) => sum + row.balance, 0n);
    const dn = balances.filter((row) => row.leg === "dn" && row.marketId === id.toLowerCase()).reduce((sum, row) => sum + row.balance, 0n);
    expect(collateralHeld(events, id.toLowerCase())).toBe(payoutUp(up, WAD / 2n) + payoutDn(dn, WAD / 2n));
    const chain = balances.map((row) => ({ account: row.account, note: row.note, balance: row.balance }));
    expect(compareBalances(balances, chain).ok).toBe(true);
    chain[0] = { ...chain[0]!, balance: chain[0]!.balance + 1n };
    expect(compareBalances(balances, chain).ok).toBe(false);
  });

  it("stores a realized gap and a surface from quoted caps", () => {
    const view = snapshot(events);
    expect(view.gaps).toEqual([
      {
        ticker: ticker.toLowerCase(),
        tickerLabel: "NVDA",
        sessionId: sessionId.toString(),
        gap: (WAD / 10n).toString(),
      },
    ]);
    const surface = view.surfaces.find((row) => row.tickerLabel === "NVDA");
    expect(surface?.reason).toBeNull();
    expect(surface?.above.length).toBe(1);
    expect(surface?.premium).toBe("25");
    expect(view.sessions[0]?.marketIds).toHaveLength(2);
  });

  it("does not invent a mid when a packed book update cannot be decoded", () => {
    const broken = log().slice(0, 11);
    broken.push({
      contract: "KuruOrderBook",
      event: "BookUpdatesPacked",
      address: bookUp,
      blockNumber: 10,
      logIndex: 99,
      args: {
        accountId: "1",
        executor: alice,
        clientOrderId: stringToHex("bad", { size: 32 }),
        packedUpdates: "0x01",
      },
    });
    const tight = snapshot(broken).markets.find((row) => row.marketId === id.toLowerCase());
    expect(tight?.midUp).toBeNull();
    expect(tight?.bookError).toBeTruthy();
  });

  it("refuses a live chain comparison while the deployment addresses are empty", () => {
    expect(liveReconcileReady()).toEqual({
      ready: false,
      reason: "Closure contracts are not deployed on chain 10143.",
    });
  });
});

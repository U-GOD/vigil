import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  SLOT_COUNT,
  WAD,
  approveTokenRequest,
  buyProtectionRequest,
  depositRequest,
  loadDeployments,
  mintIn,
  mintPairRequest,
  placeBatch,
  pluginCall,
  tradeSignerTypedData,
} from "@vigil/sdk";
import { buildTradeDelegate, tradeDelegateCall } from "../src/lib/delegate.js";
import {
  Refusal,
  assertTradePermission,
  bookPriceToWad,
  clientOrderIdFor,
  costBps,
  emptyChain,
  nextCap,
  planCover,
  planMint,
  planRoll,
  planSettle,
  planUnderwrite,
  resolveCap,
  wadToBookPrice,
  type ChainView,
} from "../src/lib/plan.js";
import { applyPatch, defaultPolicy, loadPolicy, savePolicy } from "../src/lib/policy.js";
import { marketsReport, positionsReport, quoteReport } from "../src/lib/report.js";
import { closureSession, parseInterval } from "../src/lib/session.js";
import { buildSessions } from "@vigil/marketdata";

const adapter = getAddress("0x00000000000000000000000000000000000000a1");
const collateral = getAddress("0x00000000000000000000000000000000000000a2");
const bookUp = getAddress("0x00000000000000000000000000000000000000a3");
const bookDn = getAddress("0x00000000000000000000000000000000000000a4");
const noteUp = getAddress("0x00000000000000000000000000000000000000a5");
const noteDn = getAddress("0x00000000000000000000000000000000000000a6");
const account = getAddress("0x00000000000000000000000000000000000000b1");
const accountCore = loadDeployments(10143).kuru.accountCore;
const market = `0x${"11".repeat(32)}` as const;
const k = WAD / 10n;
const inventory = 1_000_000_000n;
const pairs = 200_000_000n;
const fair = WAD / 2n;
const slots = Array.from({ length: SLOT_COUNT }, () => 0n);

function chain(over: Partial<ChainView> = {}): ChainView {
  return emptyChain({
    bookUp,
    bookDn,
    noteUp,
    noteDn,
    ask: fair,
    collateralBalance: 1_000_000_000_000n,
    userId: 7n,
    liveOrderIdsUp: slots,
    liveOrderIdsDn: slots,
    ...over,
  });
}

function cover(over: Partial<Parameters<typeof planCover>[0]> = {}) {
  return planCover({
    ticker: "NVDA",
    sessionLive: true,
    sessionId: 20260925n,
    policy: defaultPolicy(),
    adapter,
    collateral,
    accountCore,
    account,
    chain: chain(),
    inventoryValue: inventory,
    k,
    coverage: WAD,
    fairDn: fair,
    fairUp: fair,
    marketId: market,
    ...over,
  });
}

describe("policy and session", () => {
  it("round-trips the local policy file", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vigil-policy-"));
    const file = path.join(dir, "policy.json");
    const policy = applyPatch(defaultPolicy(), { maxCostBps: "15", earningsExcluded: "nvda,aapl" });
    savePolicy(file, policy);
    const loaded = loadPolicy(file);
    expect(loaded.maxCostBps).toBe(15);
    expect(loaded.earningsExcluded).toEqual(["NVDA", "AAPL"]);
  });

  it("parses a foreground interval and finds a live closure window", () => {
    expect(parseInterval("60s")).toBe(60_000);
    expect(parseInterval("5m")).toBe(300_000);
    const session = buildSessions([2026, 9, 1], [2026, 10, 1])[0];
    expect(session).toBeDefined();
    expect(closureSession(session!.closeTs)?.id).toBe(session!.id);
    expect(closureSession(session!.closeTs - 1)).toBeNull();
  });

  it("picks the tightest cap that is not tighter than the policy minimum", () => {
    const policy = defaultPolicy();
    expect(resolveCap(policy, null)).toBe(WAD / 10n);
    expect(resolveCap(policy, WAD / 100n)).toBeNull();
    expect(nextCap(policy, WAD / 10n)).toBe((WAD * 25n) / 100n);
  });
});

describe("cover calldata", () => {
  it("lifts a DN offer with the shared SDK encoders", () => {
    const plan = cover();
    expect(plan.refusal).toBeUndefined();
    expect(plan.report).toContain(pairs.toString());
    const notional = (pairs * fair) / WAD;
    const price = wadToBookPrice(fair, "buy");
    const expected = [
      pluginCall(buyProtectionRequest(adapter, market, notional)),
      pluginCall(approveTokenRequest({ token: collateral, spender: accountCore, amount: notional })),
      pluginCall(depositRequest({ accountCore, token: collateral, amount: notional })),
      pluginCall(
        placeBatch(slots, {
          market: bookDn,
          userId: 7n,
          clientOrderId: clientOrderIdFor("vigil:cover", "NVDA", 20260925n),
          orders: [
            {
              side: "buy",
              quantity: pairs,
              price,
              tif: "ioc",
              executionInstruction: "none",
            },
          ],
        }).request,
      ),
    ];
    expect(plan.steps.map((step) => step.data)).toEqual(expected.map((call) => call.data));
    expect(plan.steps.map((step) => step.to)).toEqual(expected.map((call) => call.to));
    const allowed = new Set([adapter, collateral, accountCore, bookDn, bookUp, noteUp, noteDn]);
    for (const step of plan.steps) expect(allowed.has(step.to)).toBe(true);
  });

  it("mints and rests UP when the book is one-sided", () => {
    const plan = cover({ chain: chain({ ask: null, mintFeeBps: 3n }) });
    const { requiredIn } = mintIn(pairs, 3n);
    const minted = pluginCall(mintPairRequest(adapter, market, pairs, account));
    expect(plan.steps.map((step) => step.data)).toContain(minted.data);
    expect(plan.steps[0]?.data).toBe(
      pluginCall(approveTokenRequest({ token: collateral, spender: adapter, amount: requiredIn })).data,
    );
    expect(plan.steps.at(-1)?.to).toBe(bookUp);
  });

  it("refuses an unbound book, a halted market, a policy breach, and a missing deployment", () => {
    expect(cover({ chain: chain({ bound: false }) }).refusal).toBe(Refusal.unbound);
    expect(cover({ chain: chain({ bound: false }) }).steps).toEqual([]);
    expect(cover({ chain: chain({ halted: true, trading: false }) }).refusal).toBe(Refusal.halted);
    expect(cover({ sessionLive: false, sessionId: null }).refusal).toBe(Refusal.noSession);
    expect(cover({ adapter: null, marketId: null }).refusal).toBe(Refusal.undeployed);
    const expensive = cover({
      chain: chain({ ask: fair + fair / 10n, mintFeeBps: 100n }),
      policy: { ...defaultPolicy(), maxCostBps: 1 },
    });
    expect(expensive.refusal).toBe(Refusal.cost);
    expect(expensive.steps).toEqual([]);
    expect(cover({ chain: chain({ collateralBalance: 1n }) }).refusal).toBe(Refusal.collateral);
    expect(cover({ chain: chain({ liveOrderIdsDn: null }) }).refusal).toBe(Refusal.slots);
  });
});

describe("mint, underwrite, roll, settle", () => {
  it("burns through the adapter", () => {
    const plan = planMint({
      ticker: "NVDA",
      sessionLive: true,
      sessionId: 1n,
      policy: defaultPolicy(),
      adapter,
      collateral,
      accountCore,
      account,
      chain: chain(),
      pairs: 1_000_000n,
      burn: true,
      marketId: market,
      k,
    });
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps[2]?.to).toBe(adapter);
  });

  it("skips an earnings name and refuses when the adapter is not deployed", () => {
    const plan = planUnderwrite({
      ticker: "NVDA",
      sessionLive: true,
      sessionId: 1n,
      policy: { ...defaultPolicy(), earningsExcluded: ["AAPL"] },
      adapter: null,
      collateral: null,
      accountCore,
      account,
      chain: null,
      k,
      coverage: WAD,
      legs: [
        {
          ticker: "AAPL",
          inventoryValue: inventory,
          fairDn: fair,
          earnings: false,
          marketId: null,
          bound: false,
          bookDn: null,
          noteDn: null,
          liveOrderIds: null,
        },
        {
          ticker: "NVDA",
          inventoryValue: inventory,
          fairDn: fair,
          earnings: false,
          marketId: null,
          bound: false,
          bookDn: null,
          noteDn: null,
          liveOrderIds: null,
        },
      ],
    });
    expect(plan.report).toContain("AAPL: skipped, earnings exclusion.");
    expect(plan.refusal).toBe(Refusal.undeployed);
    expect(plan.steps).toEqual([]);
  });

  it("does not roll inside the cap and does not submit a pinned roll without a book", () => {
    const base = {
      ticker: "NVDA",
      sessionLive: true,
      sessionId: 1n,
      policy: defaultPolicy(),
      adapter,
      collateral,
      accountCore,
      account,
      chain: chain(),
      inventoryValue: inventory,
      coverage: WAD,
      currentK: k,
      pairsHeld: pairs,
      currentMarketId: market,
      widerMarketId: market,
      widerK: (WAD * 25n) / 100n,
      widerBound: true,
      widerBookUp: bookUp,
      widerNoteUp: noteUp,
      widerLiveOrderIds: slots,
      fairUp: fair,
    };
    const inside = planRoll({ ...base, absGapWad: k - 1n });
    expect(inside.steps).toEqual([]);
    expect(inside.refusal).toBeUndefined();
    const pinned = planRoll({ ...base, absGapWad: k, chain: null, currentMarketId: null, widerMarketId: null });
    expect(pinned.refusal).toBe(Refusal.undeployed);
    expect(pinned.steps).toEqual([]);
  });

  it("reports unhedged and redeemed amounts and refuses before a deployment", () => {
    const plan = planSettle({
      ticker: "NVDA",
      finalized: false,
      adapter: null,
      marketId: null,
      account,
      noteUp: null,
      noteDn: null,
      upAmt: 0n,
      dnAmt: pairs,
      upAllowance: 0n,
      dnAllowance: 0n,
      inventoryValue: inventory,
      premiumPaid: 1_000_000n,
      pClose: 100n * WAD,
      pOpen: 95n * WAD,
      kUp: k,
      kDn: k,
    });
    expect(plan.report).toContain("Unhedged counterfactual");
    expect(plan.report).toContain("Redemption");
    expect(plan.refusal).toBe(Refusal.undeployed);
    expect(plan.steps).toEqual([]);
  });
});

describe("trade delegate", () => {
  it("forwards only the TRADE bit that was read", () => {
    expect(assertTradePermission(4n, 8n)).toBe(4);
    expect(() => assertTradePermission(8n, 8n)).toThrow(/WITHDRAW/);
    expect(() => assertTradePermission(0n, 8n)).toThrow(/TRADE/);
    const typed = buildTradeDelegate({
      accountCore,
      account,
      signer: noteUp,
      permissions: 4,
      expiry: 10n,
      nonce: 3n,
      deadline: 10n,
    });
    expect(typed.message.permissions).toBe(4);
    expect(typed).toEqual(
      tradeSignerTypedData({
        accountCore,
        chainId: 10143,
        account,
        authorizer: account,
        signer: noteUp,
        permissions: 4,
        expiry: 10n,
        nonce: 3n,
        deadline: 10n,
      }),
    );
    const signature = `0x${"ab".repeat(65)}` as const;
    const call = tradeDelegateCall({
      accountCore,
      account,
      signer: noteUp,
      permissions: 4,
      expiry: 10n,
      nonce: 3n,
      deadline: 10n,
      signature,
    });
    expect(call.to).toBe(accountCore);
    expect(call.data).toContain(noteUp.slice(2).toLowerCase());
  });
});

describe("reports", () => {
  it("does not invent a book or a position", () => {
    expect(marketsReport(1_700_000_000)).toContain(
      "PolicyAdapter 0xCf590C99C9FA28e3a220cA9CfC9b05C969140310",
    );
    expect(marketsReport(1_700_000_000)).toContain("No Closure Note book is registered");
    expect(loadDeployments(10143).core.policy).toBe("0xCf590C99C9FA28e3a220cA9CfC9b05C969140310");
    expect(
      positionsReport({ inventory: null, notes: null, kUp: k, kDn: k, onchain: false }),
    ).toContain("not computed");
    const full = positionsReport({
      inventory,
      notes: pairs,
      kUp: k,
      kDn: k,
      onchain: false,
    });
    expect(full).toContain("1.000000000000000000");
  });

  it("formats a sourced band as a model, not a venue quote", () => {
    const text = quoteReport({
      ticker: "NVDA",
      pClose: { price: 100n * WAD, timestampMs: 1, source: "yahoo-chart" },
      anchor: { price: 100n * WAD, timestampMs: 1, source: "coingecko+jupiter" },
      legs: [],
      caps: [{ k, up: fair, dn: fair, low: fair, high: fair }],
    });
    expect(text).toContain("not a venue quote");
    expect(text).toContain("yahoo-chart");
  });

  it("converts WAD prices onto the Closure Note tick", () => {
    expect(wadToBookPrice(fair, "sell") % 100n).toBe(0n);
    expect(bookPriceToWad(500_000n)).toBe(fair);
    expect(costBps(fair, fair)).toBe(0n);
    expect(costBps(fair + fair / 100n, fair)).toBe(100n);
  });
});

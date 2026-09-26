import { keccak256, toBytes, type Address, type Hex } from "viem";
import { sizeHedge } from "@vigil/riskmodel";
import {
  CN_BOOK_SPEC,
  SLOT_COUNT,
  WAD,
  approveTokenRequest,
  burnPairRequest,
  buyProtectionRequest,
  depositRequest,
  freeSlotCount,
  marketId,
  mintIn,
  mintPairRequest,
  payoutDn,
  payoutUp,
  placeBatch,
  pluginCall,
  redeemRequest,
  splitUp,
} from "@vigil/sdk";
import { formatUnits, formatWad } from "./format.js";
import type { RiskPolicy } from "./policy.js";

export type PlannedStep = {
  rationale: string;
  to: Address;
  data: Hex;
  value: bigint;
};

export type Plan = {
  report: string;
  steps: PlannedStep[];
  refusal?: string;
};

export const Refusal = {
  noSession: "No live closure session. Refusing to trade.",
  cost: "Cost exceeds the local risk policy.",
  notional: "Notional exceeds the local risk policy.",
  coverage: "Coverage is below the local risk policy.",
  cap: "Cap is outside the local risk policy.",
  collateral: "Insufficient collateral for the sized hedge.",
  halted: "Market is halted. Refusing to trade.",
  trading: "Market is not trading.",
  oracle: "Oracle is not finalized. Refusing to redeem.",
  unbound: "No Closure Note book is bound. Refusing to trade.",
  undeployed: "PolicyAdapter is not deployed on chain 10143. Refusing to submit.",
  allowlist: "Market is not allowlisted on PolicyAdapter.",
  slots: "No free Kuru order slot was read. Refusing to trade.",
  account: "Kuru account is not registered.",
  bounds: "Sized hedge is outside the Closure Note book notional bounds.",
  empty: "Nothing to redeem.",
} as const;

export type ChainView = {
  allowed: boolean;
  bound: boolean;
  halted: boolean;
  trading: boolean;
  finalized: boolean;
  bookUp: Address | null;
  bookDn: Address | null;
  noteUp: Address | null;
  noteDn: Address | null;
  ask: bigint | null;
  collateralAllowanceAdapter: bigint;
  collateralAllowanceCore: bigint;
  noteUpAllowanceCore: bigint;
  noteDnAllowanceCore: bigint;
  collateralBalance: bigint;
  mintFeeBps: bigint;
  userId: bigint;
  liveOrderIdsUp: readonly bigint[] | null;
  liveOrderIdsDn: readonly bigint[] | null;
};

export function resolveCap(policy: RiskPolicy, requested: bigint | null): bigint | null {
  if (requested !== null) return requested >= policy.minCapWad ? requested : null;
  const fits = policy.allowedCapsWad.filter((k) => k >= policy.minCapWad);
  if (fits.length === 0) return null;
  return fits.reduce((tight, cap) => (tight < cap ? tight : cap));
}

export function nextCap(policy: RiskPolicy, current: bigint): bigint | null {
  const wider = policy.allowedCapsWad.filter((k) => k > current);
  if (wider.length === 0) return null;
  return wider.reduce((tight, cap) => (tight < cap ? tight : cap));
}

export function closureMarketId(
  ticker: string,
  sessionId: bigint,
  k: bigint,
  collateral: Address,
): Hex {
  return marketId(keccak256(toBytes(ticker)), sessionId, k, k, collateral);
}

export function clientOrderIdFor(command: string, ticker: string, sessionId: bigint): Hex {
  return keccak256(toBytes(`${command}:${ticker}:${sessionId}`));
}

export function costBps(paid: bigint, fair: bigint): bigint {
  if (fair <= 0n || paid <= fair) return 0n;
  return ((paid - fair) * 10_000n) / fair;
}

export function wadToBookPrice(wad: bigint, side: "buy" | "sell"): bigint {
  const precision = BigInt(CN_BOOK_SPEC.pricePrecision);
  const tick = BigInt(CN_BOOK_SPEC.tickSize);
  const scale = (wad * precision) / WAD;
  if (side === "sell") return scale - (scale % tick);
  const remainder = scale % tick;
  return remainder === 0n ? scale : scale + (tick - remainder);
}

export function bookPriceToWad(price: bigint): bigint {
  return (price * WAD) / BigInt(CN_BOOK_SPEC.pricePrecision);
}

export function assertTradePermission(trade: bigint, withdraw: bigint): number {
  if (trade === 0n || trade === withdraw) {
    throw new Error("TRADE permission is missing or equal to WITHDRAW");
  }
  return Number(trade);
}

type Base = {
  ticker: string;
  sessionLive: boolean;
  sessionId: bigint | null;
  policy: RiskPolicy;
  adapter: Address | null;
  collateral: Address | null;
  accountCore: Address;
  account: Address;
  chain: ChainView | null;
};

export function planCover(
  input: Base & {
    inventoryValue: bigint;
    k: bigint | null;
    coverage: bigint;
    fairDn: bigint;
    fairUp: bigint;
    marketId: Hex | null;
  },
): Plan {
  if (!input.sessionLive || input.sessionId === null) {
    return refuse(sizeLine(input.ticker, null), Refusal.noSession);
  }
  const k = input.k;
  if (k === null) return refuse(sizeLine(input.ticker, null), Refusal.cap);
  if (input.coverage < input.policy.minCoverageWad) {
    return refuse(sizeLine(input.ticker, null), Refusal.coverage);
  }
  const pairs = sizeHedge(input.inventoryValue, k, k, input.coverage);
  const report = sizeLine(input.ticker, pairs);
  if (pairs === 0n) return refuse(report, Refusal.collateral);
  if (pairs > input.policy.perTickerNotional || pairs > input.policy.aggregateNotional) {
    return refuse(report, Refusal.notional);
  }
  if (!input.adapter || !input.collateral || !input.marketId) {
    return refuse(report, Refusal.undeployed);
  }
  const chain = input.chain;
  if (!chain) return refuse(report, Refusal.undeployed);
  if (!chain.allowed) return refuse(report, Refusal.allowlist);
  if (chain.halted) return refuse(report, Refusal.halted);
  if (!chain.trading) return refuse(report, Refusal.trading);
  if (!chain.bound || !chain.bookDn || !chain.bookUp || !chain.noteUp) {
    return refuse(report, Refusal.unbound);
  }
  if (chain.userId === 0n) return refuse(report, Refusal.account);

  const lift =
    chain.ask !== null && costBps(chain.ask, input.fairDn) <= BigInt(input.policy.maxCostBps);
  if (!lift && chain.mintFeeBps > BigInt(input.policy.maxCostBps)) {
    return refuse(report, Refusal.cost);
  }

  const orderId = clientOrderIdFor("vigil:cover", input.ticker, input.sessionId);
  if (lift && chain.ask !== null) {
    const notional = (pairs * chain.ask) / WAD;
    if (chain.collateralBalance < notional) return refuse(report, Refusal.collateral);
    const price = wadToBookPrice(chain.ask, "buy");
    if (!withinBook(price, pairs)) return refuse(report, Refusal.bounds);
    const steps: PlannedStep[] = [
      tx(
        `Reserve ${notional} collateral units with PolicyAdapter.buyProtection before the order.`,
        buyProtectionRequest(input.adapter, input.marketId, notional),
      ),
    ];
    if (chain.collateralAllowanceCore < notional) {
      steps.push(
        tx(
          "Approve collateral to AccountCore for the deposit.",
          approveTokenRequest({
            token: input.collateral,
            spender: input.accountCore,
            amount: notional,
          }),
        ),
      );
    }
    steps.push(
      tx(
        "Deposit collateral into AccountCore. Withdraw is a separate command.",
        depositRequest({ accountCore: input.accountCore, token: input.collateral, amount: notional }),
      ),
    );
    const order = orderStep(
      chain.liveOrderIdsDn,
      "Lift DN offers with an IOC buy. The ask is inside the policy cost.",
      {
        market: chain.bookDn,
        userId: chain.userId,
        clientOrderId: orderId,
        orders: [{ side: "buy", quantity: pairs, price, tif: "ioc", executionInstruction: "none" }],
      },
    );
    if ("refusal" in order) return refuse(report, order.refusal);
    steps.push(order);
    return { report, steps };
  }

  const { requiredIn } = mintIn(pairs, chain.mintFeeBps);
  if (chain.collateralBalance < requiredIn) return refuse(report, Refusal.collateral);
  const price = wadToBookPrice(input.fairUp, "sell");
  if (!withinBook(price, pairs)) return refuse(report, Refusal.bounds);
  const steps: PlannedStep[] = [];
  if (chain.collateralAllowanceAdapter < requiredIn) {
    steps.push(
      tx(
        "Approve collateral to PolicyAdapter. The adapter forwards it to ClosureVault.",
        approveTokenRequest({ token: input.collateral, spender: input.adapter, amount: requiredIn }),
      ),
    );
  }
  steps.push(
    tx(
      "Mint the pair through PolicyAdapter. DN stays in the wallet as the hedge.",
      mintPairRequest(input.adapter, input.marketId, pairs, input.account),
    ),
  );
  if (chain.noteUpAllowanceCore < pairs) {
    steps.push(
      tx(
        "Approve the UP note to AccountCore.",
        approveTokenRequest({ token: chain.noteUp, spender: input.accountCore, amount: pairs }),
      ),
    );
  }
  steps.push(
    tx(
      "Deposit the UP note into AccountCore.",
      depositRequest({ accountCore: input.accountCore, token: chain.noteUp, amount: pairs }),
    ),
  );
  const order = orderStep(
    chain.liveOrderIdsUp,
    "Rest a post-only sell of UP. The DN book has no offer inside the policy cost.",
    {
      market: chain.bookUp,
      userId: chain.userId,
      clientOrderId: orderId,
      orders: [
        { side: "sell", quantity: pairs, price, tif: "gtc", executionInstruction: "postOnly" },
      ],
    },
  );
  if ("refusal" in order) return refuse(report, order.refusal);
  steps.push(order);
  return { report, steps };
}

export function planMint(
  input: Base & {
    pairs: bigint;
    burn: boolean;
    marketId: Hex | null;
    k: bigint | null;
  },
): Plan {
  const report = input.burn
    ? `Burn ${input.pairs} pairs of ${input.ticker}.`
    : `Mint ${input.pairs} pairs of ${input.ticker}.`;
  if (!input.sessionLive) return refuse(report, Refusal.noSession);
  if (input.k === null) return refuse(report, Refusal.cap);
  if (!input.adapter || !input.collateral || !input.marketId || !input.chain) {
    return refuse(report, Refusal.undeployed);
  }
  const chain = input.chain;
  if (!chain.allowed) return refuse(report, Refusal.allowlist);
  if (chain.halted) return refuse(report, Refusal.halted);
  if (input.burn) {
    if (!chain.noteUp || !chain.noteDn) return refuse(report, Refusal.undeployed);
    const steps: PlannedStep[] = [
      tx(
        "Approve the UP note to PolicyAdapter.",
        approveTokenRequest({ token: chain.noteUp, spender: input.adapter, amount: input.pairs }),
      ),
      tx(
        "Approve the DN note to PolicyAdapter.",
        approveTokenRequest({ token: chain.noteDn, spender: input.adapter, amount: input.pairs }),
      ),
    ];
    steps.push(
      tx(
        "Burn the pair through PolicyAdapter and return backing collateral.",
        burnPairRequest(input.adapter, input.marketId, input.pairs, input.account),
      ),
    );
    return { report, steps };
  }
  if (!chain.trading) return refuse(report, Refusal.trading);
  if (input.pairs > input.policy.perTickerNotional) return refuse(report, Refusal.notional);
  const { requiredIn } = mintIn(input.pairs, chain.mintFeeBps);
  if (chain.collateralBalance < requiredIn) return refuse(report, Refusal.collateral);
  const steps: PlannedStep[] = [];
  if (chain.collateralAllowanceAdapter < requiredIn) {
    steps.push(
      tx(
        "Approve collateral to PolicyAdapter. The adapter forwards it to ClosureVault.",
        approveTokenRequest({ token: input.collateral, spender: input.adapter, amount: requiredIn }),
      ),
    );
  }
  steps.push(
    tx(
      "Mint the pair through PolicyAdapter.",
      mintPairRequest(input.adapter, input.marketId, input.pairs, input.account),
    ),
  );
  return { report, steps };
}

export type UnderwriteLeg = {
  ticker: string;
  inventoryValue: bigint;
  fairDn: bigint;
  earnings: boolean;
  marketId: Hex | null;
  bound: boolean;
  bookDn: Address | null;
  noteDn: Address | null;
  liveOrderIds: readonly bigint[] | null;
};

export function planUnderwrite(
  input: Base & {
    legs: UnderwriteLeg[];
    k: bigint | null;
    coverage: bigint;
  },
): Plan {
  if (!input.sessionLive || input.sessionId === null) {
    return refuse("Underwrite the basket.", Refusal.noSession);
  }
  if (input.k === null) return refuse("Underwrite the basket.", Refusal.cap);
  if (input.chain?.halted) return refuse("Underwrite the basket.", Refusal.halted);
  if (input.chain && !input.chain.trading) return refuse("Underwrite the basket.", Refusal.trading);
  if (input.chain && input.chain.userId === 0n) return refuse("Underwrite the basket.", Refusal.account);

  const lines: string[] = [];
  const steps: PlannedStep[] = [];
  let spent = 0n;
  let balance = input.chain?.collateralBalance ?? 0n;
  const chain = input.chain;
  for (const leg of input.legs) {
    if (leg.earnings || input.policy.earningsExcluded.includes(leg.ticker.toUpperCase())) {
      lines.push(`${leg.ticker}: skipped, earnings exclusion.`);
      continue;
    }
    if (!input.adapter || !input.collateral || !chain) {
      lines.push(`${leg.ticker}: skipped, PolicyAdapter is not deployed.`);
      continue;
    }
    if (!leg.bound || !leg.bookDn || !leg.noteDn || !leg.marketId || !chain.allowed) {
      lines.push(`${leg.ticker}: skipped, book is not bound.`);
      continue;
    }
    const pairs = sizeHedge(leg.inventoryValue, input.k, input.k, input.coverage);
    const room = input.policy.aggregateNotional - spent;
    const capped = [pairs, input.policy.perTickerNotional, room].reduce((a, b) => (a < b ? a : b));
    if (capped === 0n) {
      lines.push(`${leg.ticker}: skipped, budget is exhausted.`);
      continue;
    }
    const minPriceWad =
      leg.fairDn + (leg.fairDn * BigInt(input.policy.minPremiumBps)) / 10_000n;
    const price = wadToBookPrice(minPriceWad > WAD ? WAD : minPriceWad, "sell");
    if (!withinBook(price, capped)) {
      lines.push(`${leg.ticker}: skipped, outside book notional bounds.`);
      continue;
    }
    const { requiredIn } = mintIn(capped, chain.mintFeeBps);
    if (balance < requiredIn) {
      lines.push(`${leg.ticker}: skipped, insufficient collateral.`);
      continue;
    }
    const orderId = clientOrderIdFor("vigil:underwrite", leg.ticker, input.sessionId);
    steps.push(
      tx(
        `Approve collateral for ${leg.ticker}.`,
        approveTokenRequest({ token: input.collateral, spender: input.adapter, amount: requiredIn }),
      ),
    );
    steps.push(
      tx(
        `Mint ${leg.ticker} through PolicyAdapter and keep UP.`,
        mintPairRequest(input.adapter, leg.marketId, capped, input.account),
      ),
    );
    steps.push(
      tx(
        `Approve the ${leg.ticker} DN note to AccountCore.`,
        approveTokenRequest({ token: leg.noteDn, spender: input.accountCore, amount: capped }),
      ),
    );
    steps.push(
      tx(
        `Deposit the ${leg.ticker} DN note.`,
        depositRequest({ accountCore: input.accountCore, token: leg.noteDn, amount: capped }),
      ),
    );
    const order = orderStep(
      leg.liveOrderIds,
      `Rest a post-only sell of ${leg.ticker} DN at the minimum premium.`,
      {
        market: leg.bookDn,
        userId: chain.userId,
        clientOrderId: orderId,
        orders: [
          { side: "sell", quantity: capped, price, tif: "gtc", executionInstruction: "postOnly" },
        ],
      },
    );
    if ("refusal" in order) return refuse(lines.join("\n"), order.refusal);
    steps.push(order);
    spent += capped;
    balance -= requiredIn;
    lines.push(`${leg.ticker}: sell ${capped} DN, reserved ${spent} of the aggregate budget.`);
  }
  const report = lines.join("\n");
  if (steps.length === 0) {
    const undeployed = lines.some((line) => line.includes("not deployed"));
    return refuse(report || "Underwrite the basket.", undeployed ? Refusal.undeployed : Refusal.unbound);
  }
  return { report, steps };
}

export function planRoll(
  input: Base & {
    inventoryValue: bigint;
    coverage: bigint;
    currentK: bigint;
    absGapWad: bigint;
    pairsHeld: bigint;
    currentMarketId: Hex | null;
    widerMarketId: Hex | null;
    widerK: bigint | null;
    widerBound: boolean;
    widerBookUp: Address | null;
    widerNoteUp: Address | null;
    widerLiveOrderIds: readonly bigint[] | null;
    fairUp: bigint;
  },
): Plan {
  if (input.absGapWad < input.currentK) {
    return { report: "Protection is inside the cap. No roll.", steps: [] };
  }
  const report = `Pinned at cap ${formatWad(input.currentK)}.`;
  if (!input.sessionLive) return refuse(report, Refusal.noSession);
  if (input.widerK === null) return refuse(report, Refusal.cap);
  if (!input.adapter || !input.collateral || !input.chain || !input.currentMarketId || !input.widerMarketId) {
    return refuse(report, Refusal.undeployed);
  }
  const chain = input.chain;
  if (chain.halted) return refuse(report, Refusal.halted);
  if (!chain.trading) return refuse(report, Refusal.trading);
  if (!chain.bound || !input.widerBound || !chain.noteUp || !chain.noteDn || !input.widerNoteUp || !input.widerBookUp) {
    return refuse(report, Refusal.unbound);
  }
  if (chain.userId === 0n || input.sessionId === null) return refuse(report, Refusal.account);
  const pairs = sizeHedge(input.inventoryValue, input.widerK, input.widerK, input.coverage);
  if (pairs > input.policy.perTickerNotional) return refuse(report, Refusal.notional);
  const { requiredIn } = mintIn(pairs, chain.mintFeeBps);
  if (chain.collateralBalance + input.pairsHeld < requiredIn) return refuse(report, Refusal.collateral);
  const steps: PlannedStep[] = [
    tx(
      "Approve both current notes to PolicyAdapter.",
      approveTokenRequest({ token: chain.noteUp, spender: input.adapter, amount: input.pairsHeld }),
    ),
    tx(
      "Approve the current DN note to PolicyAdapter.",
      approveTokenRequest({ token: chain.noteDn, spender: input.adapter, amount: input.pairsHeld }),
    ),
    tx(
      "Burn the tight pair through PolicyAdapter.",
      burnPairRequest(input.adapter, input.currentMarketId, input.pairsHeld, input.account),
    ),
    tx(
      "Approve collateral for the wider pair.",
      approveTokenRequest({ token: input.collateral, spender: input.adapter, amount: requiredIn }),
    ),
    tx(
      "Mint the wider pair through PolicyAdapter.",
      mintPairRequest(input.adapter, input.widerMarketId, pairs, input.account),
    ),
    tx(
      "Approve the wider UP note to AccountCore.",
      approveTokenRequest({ token: input.widerNoteUp, spender: input.accountCore, amount: pairs }),
    ),
    tx(
      "Deposit the wider UP note.",
      depositRequest({ accountCore: input.accountCore, token: input.widerNoteUp, amount: pairs }),
    ),
  ];
  const order = orderStep(input.widerLiveOrderIds, "Rest a post-only sell of the wider UP leg.", {
    market: input.widerBookUp,
    userId: chain.userId,
    clientOrderId: clientOrderIdFor("vigil:roll", input.ticker, input.sessionId),
    orders: [
      {
        side: "sell",
        quantity: pairs,
        price: wadToBookPrice(input.fairUp, "sell"),
        tif: "gtc",
        executionInstruction: "postOnly",
      },
    ],
  });
  if ("refusal" in order) return refuse(report, order.refusal);
  steps.push(order);
  return { report: `${report} Roll into ${formatWad(input.widerK)}, size ${pairs}.`, steps };
}

export function planSettle(input: {
  ticker: string;
  finalized: boolean;
  adapter: Address | null;
  marketId: Hex | null;
  account: Address;
  noteUp: Address | null;
  noteDn: Address | null;
  upAmt: bigint;
  dnAmt: bigint;
  upAllowance: bigint;
  dnAllowance: bigint;
  inventoryValue: bigint;
  premiumPaid: bigint;
  pClose: bigint;
  pOpen: bigint;
  kUp: bigint;
  kDn: bigint;
}): Plan {
  const sUp = splitUp(input.pClose, input.pOpen, WAD, input.kUp, input.kDn);
  const redemption = payoutUp(input.upAmt, sUp) + payoutDn(input.dnAmt, sUp);
  const gap = (sUp * (input.kUp + input.kDn)) / WAD - input.kDn;
  const unhedged = (input.inventoryValue * gap) / WAD;
  const report = [
    `Unhedged counterfactual ${formatUnits(unhedged, 6)} collateral.`,
    `Redemption ${formatUnits(redemption, 6)} collateral.`,
    `Premium paid ${formatUnits(input.premiumPaid, 6)} collateral.`,
    `Hedge proceeds net of premium ${formatUnits(redemption - input.premiumPaid, 6)} collateral.`,
  ].join("\n");
  if (!input.adapter || !input.marketId) return refuse(report, Refusal.undeployed);
  if (!input.finalized) return refuse(report, Refusal.oracle);
  if (input.upAmt === 0n && input.dnAmt === 0n) return refuse(report, Refusal.empty);
  const steps: PlannedStep[] = [];
  if (input.upAmt > 0n && input.noteUp && input.upAllowance < input.upAmt) {
    steps.push(
      tx(
        "Approve the UP note to PolicyAdapter.",
        approveTokenRequest({ token: input.noteUp, spender: input.adapter, amount: input.upAmt }),
      ),
    );
  }
  if (input.dnAmt > 0n && input.noteDn && input.dnAllowance < input.dnAmt) {
    steps.push(
      tx(
        "Approve the DN note to PolicyAdapter.",
        approveTokenRequest({ token: input.noteDn, spender: input.adapter, amount: input.dnAmt }),
      ),
    );
  }
  steps.push(
    tx(
      "Redeem through PolicyAdapter. AccountCore withdrawal is not included.",
      redeemRequest(input.adapter, input.marketId, input.upAmt, input.dnAmt, input.account),
    ),
  );
  return { report, steps };
}

export function emptyChain(over: Partial<ChainView> = {}): ChainView {
  return {
    allowed: true,
    bound: true,
    halted: false,
    trading: true,
    finalized: false,
    bookUp: null,
    bookDn: null,
    noteUp: null,
    noteDn: null,
    ask: null,
    collateralAllowanceAdapter: 0n,
    collateralAllowanceCore: 0n,
    noteUpAllowanceCore: 0n,
    noteDnAllowanceCore: 0n,
    collateralBalance: 0n,
    mintFeeBps: 0n,
    userId: 0n,
    liveOrderIdsUp: null,
    liveOrderIdsDn: null,
    ...over,
  };
}

function sizeLine(ticker: string, pairs: bigint | null): string {
  if (pairs === null) return `${ticker}: hedge size was not computed.`;
  return `${ticker}: hedge size ${pairs} DN notes.`;
}

function withinBook(price: bigint, quantity: bigint): boolean {
  if (price === 0n) return false;
  const quote = (price * quantity) / BigInt(CN_BOOK_SPEC.pricePrecision);
  return quote >= CN_BOOK_SPEC.minQuoteNotional && quote <= CN_BOOK_SPEC.maxQuoteNotional;
}

function tx(rationale: string, request: Parameters<typeof pluginCall>[0]): PlannedStep {
  const call = pluginCall(request);
  return { rationale, to: call.to, data: call.data, value: call.value };
}

function orderStep(
  liveOrderIds: readonly bigint[] | null,
  rationale: string,
  params: Parameters<typeof placeBatch>[1],
): PlannedStep | { refusal: string } {
  if (!liveOrderIds || liveOrderIds.length !== SLOT_COUNT || freeSlotCount(liveOrderIds) < 1) {
    return { refusal: Refusal.slots };
  }
  return tx(rationale, placeBatch(liveOrderIds, params).request);
}

function refuse(report: string, refusal: string): Plan {
  return { report, refusal, steps: [] };
}

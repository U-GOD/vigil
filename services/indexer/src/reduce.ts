import { decodeTradesPacked } from "@toxicflow-labs/ts-sdk/events";
import { extractSurface, type CapMid } from "@vigil/riskmodel";
import { CN_BOOK_SPEC, WAD, neutralSplit } from "@vigil/sdk";
import { getAddress, hexToString, isHex, type Hex } from "viem";
import { applyPackedBook, emptyBook, quoteBook, type Book } from "./book.js";
import type {
  GapView,
  LogEvent,
  MarketView,
  NoteBalance,
  PositionView,
  PrintView,
  SessionView,
  SettlementView,
  Snapshot,
  SurfaceView,
} from "./types.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const PRICE = BigInt(CN_BOOK_SPEC.pricePrecision);

type SessionRow = {
  sessionId: bigint;
  exchange: string;
  closeTs: bigint;
  openTs: bigint;
  fallbackDeadline: bigint;
  printBandSecs: bigint;
  noAuction: boolean;
  successorId: bigint | null;
};

type MarketRow = {
  marketId: string;
  ticker: string;
  sessionId: bigint;
  kUp: bigint;
  kDn: bigint;
  collateral: string;
  noteUp: string;
  noteDn: string;
  bookUp: string | null;
  bookDn: string | null;
  state: string;
  sUp: bigint | null;
  fallbackSettle: boolean | null;
  underwritingPairs: bigint;
  collateralHeld: bigint;
  tradeCount: number;
  bookError: string | null;
};

type PrintRow = {
  ticker: string;
  sessionId: bigint;
  kind: "close" | "open";
  price: bigint | null;
  candidate: bigint | null;
  finalized: boolean;
  voided: boolean;
};

type State = {
  sessions: Map<string, SessionRow>;
  markets: Map<string, MarketRow>;
  notes: Map<string, { marketId: string; leg: "up" | "dn" }>;
  balances: Map<string, Map<string, bigint>>;
  books: Map<string, Book>;
  bookOf: Map<string, { marketId: string; leg: "up" | "dn" }>;
  prints: Map<string, PrintRow>;
  settlements: Map<string, { marketId: string; sUp: bigint; fallbackSettle: boolean; blockNumber: number }>;
  premiums: Map<string, bigint>;
  lastBlock: number;
};

function emptyState(): State {
  return {
    sessions: new Map(),
    markets: new Map(),
    notes: new Map(),
    balances: new Map(),
    books: new Map(),
    bookOf: new Map(),
    prints: new Map(),
    settlements: new Map(),
    premiums: new Map(),
    lastBlock: 0,
  };
}

function addr(value: string): string {
  return getAddress(value).toLowerCase();
}

function arg(event: LogEvent, name: string): string {
  const value = event.args[name];
  if (value === undefined) throw new Error(`${event.contract}.${event.event} missing ${name}`);
  return value;
}

function hexId(event: LogEvent, name: string): string {
  return arg(event, name).toLowerCase();
}

function int(event: LogEvent, name: string): bigint {
  return BigInt(arg(event, name));
}

function flag(event: LogEvent, name: string): boolean {
  return arg(event, name) === "true";
}

function kindOf(value: string): "close" | "open" {
  if (value === "0" || value === "close") return "close";
  if (value === "1" || value === "open") return "open";
  throw new Error(`unknown print kind ${value}`);
}

export function tickerLabel(ticker: string): string {
  if (!isHex(ticker) || ticker.length !== 66) return ticker;
  return hexToString(ticker as Hex, { size: 32 }).replaceAll("\0", "");
}

function bookPriceToWad(price: bigint): bigint {
  return (price * WAD) / PRICE;
}

function market(state: State, marketId: string): MarketRow {
  const row = state.markets.get(marketId);
  if (!row) throw new Error(`market ${marketId} is not indexed`);
  return row;
}

function ensureMarket(state: State, marketId: string): MarketRow {
  const existing = state.markets.get(marketId);
  if (existing) return existing;
  const row: MarketRow = {
    marketId,
    ticker: "0x",
    sessionId: 0n,
    kUp: 0n,
    kDn: 0n,
    collateral: ZERO,
    noteUp: ZERO,
    noteDn: ZERO,
    bookUp: null,
    bookDn: null,
    state: "Unset",
    sUp: null,
    fallbackSettle: null,
    underwritingPairs: 0n,
    collateralHeld: 0n,
    tradeCount: 0,
    bookError: null,
  };
  state.markets.set(marketId, row);
  return row;
}

function linkNote(state: State, note: string, marketId: string, leg: "up" | "dn"): void {
  const key = addr(note);
  state.notes.set(key, { marketId, leg });
  if (!state.balances.has(key)) state.balances.set(key, new Map());
}

function credit(state: State, note: string, account: string, delta: bigint): void {
  const notes = state.balances.get(addr(note));
  if (!notes) return;
  const who = addr(account);
  const next = (notes.get(who) ?? 0n) + delta;
  if (next < 0n) throw new Error("indexed note balance went negative");
  notes.set(who, next);
}

function applyTransfer(state: State, event: LogEvent): void {
  const note = addr(event.address);
  if (!state.notes.has(note)) return;
  const from = addr(arg(event, "from"));
  const to = addr(arg(event, "to"));
  const value = int(event, "value");
  if (from !== ZERO) credit(state, note, from, -value);
  if (to !== ZERO) credit(state, note, to, value);
}

function applyBook(state: State, event: LogEvent): void {
  const bookAddress = addr(event.address);
  const link = state.bookOf.get(bookAddress);
  if (!link) return;
  const row = market(state, link.marketId);
  let book = state.books.get(bookAddress);
  if (!book) {
    book = emptyBook();
    state.books.set(bookAddress, book);
  }
  try {
    applyPackedBook(book, arg(event, "packedUpdates"));
    row.bookError = null;
  } catch (error) {
    row.bookError = error instanceof Error ? error.message : "book update failed";
  }
}

function applyTrades(state: State, event: LogEvent): void {
  const link = state.bookOf.get(addr(event.address));
  if (!link) return;
  const row = market(state, link.marketId);
  try {
    const trades = decodeTradesPacked(arg(event, "packedTrades") as Hex);
    row.tradeCount += trades.length;
  } catch (error) {
    row.bookError = error instanceof Error ? error.message : "trade decode failed";
  }
}

function apply(state: State, event: LogEvent): void {
  state.lastBlock = Math.max(state.lastBlock, event.blockNumber);
  if (event.contract === "SessionRegistry" && event.event === "SessionStored") {
    const sessionId = int(event, "sessionId");
    state.sessions.set(sessionId.toString(), {
      sessionId,
      exchange: arg(event, "exchange"),
      closeTs: int(event, "closeTs"),
      openTs: int(event, "openTs"),
      fallbackDeadline: int(event, "fallbackDeadline"),
      printBandSecs: int(event, "printBandSecs"),
      noAuction: false,
      successorId: null,
    });
    return;
  }
  if (event.contract === "SessionRegistry" && event.event === "NoAuctionDeclared") {
    const row = state.sessions.get(int(event, "sessionId").toString());
    if (row) row.noAuction = true;
    return;
  }
  if (event.contract === "SessionRegistry" && event.event === "SuccessorSet") {
    const row = state.sessions.get(int(event, "sessionId").toString());
    if (row) row.successorId = int(event, "successorId");
    return;
  }
  if (event.contract === "ClosureMarketFactory" && event.event === "MarketCreated") {
    const marketId = hexId(event, "marketId");
    const row = ensureMarket(state, marketId);
    row.ticker = hexId(event, "ticker");
    row.sessionId = int(event, "sessionId");
    row.kUp = int(event, "kUp");
    row.kDn = int(event, "kDn");
    row.collateral = addr(arg(event, "collateral"));
    row.noteUp = addr(arg(event, "noteUp"));
    row.noteDn = addr(arg(event, "noteDn"));
    linkNote(state, row.noteUp, marketId, "up");
    linkNote(state, row.noteDn, marketId, "dn");
    return;
  }
  if (event.contract === "SettlementEngine" && event.event === "MarketRegistered") {
    const row = ensureMarket(state, hexId(event, "marketId"));
    row.ticker = hexId(event, "ticker");
    row.sessionId = int(event, "sessionId");
    row.kUp = int(event, "kUp");
    row.kDn = int(event, "kDn");
    row.state = "Trading";
    return;
  }
  if (event.contract === "SettlementEngine" && event.event === "Halted") {
    market(state, hexId(event, "marketId")).state = "Halted";
    return;
  }
  if (event.contract === "SettlementEngine" && event.event === "Finalized") {
    const marketId = hexId(event, "marketId");
    const row = market(state, marketId);
    const fallbackSettle = flag(event, "fallbackSettle");
    row.sUp = int(event, "sUp");
    row.fallbackSettle = fallbackSettle;
    row.state = fallbackSettle ? "FallbackFinalized" : "Finalized";
    state.settlements.set(marketId, {
      marketId,
      sUp: row.sUp,
      fallbackSettle,
      blockNumber: event.blockNumber,
    });
    return;
  }
  if (event.contract === "ClosureVault" && event.event === "Minted") {
    const row = market(state, hexId(event, "marketId"));
    row.collateralHeld += int(event, "pairs");
    return;
  }
  if (event.contract === "ClosureVault" && event.event === "Burned") {
    const row = market(state, hexId(event, "marketId"));
    row.collateralHeld -= int(event, "pairs");
    return;
  }
  if (event.contract === "ClosureVault" && event.event === "Redeemed") {
    const row = market(state, hexId(event, "marketId"));
    row.collateralHeld -= int(event, "payout");
    return;
  }
  if (event.contract === "ClosureVault" && event.event === "DustSwept") {
    market(state, hexId(event, "marketId")).collateralHeld = 0n;
    return;
  }
  if (event.contract === "KuruListingAdapter" && event.event === "ListingBound") {
    const row = market(state, hexId(event, "marketId"));
    const bookUp = addr(arg(event, "bookUp"));
    const bookDn = addr(arg(event, "bookDn"));
    row.bookUp = bookUp;
    row.bookDn = bookDn;
    state.bookOf.set(bookUp, { marketId: row.marketId, leg: "up" });
    state.bookOf.set(bookDn, { marketId: row.marketId, leg: "dn" });
    return;
  }
  if (event.contract === "PrintOracle" && event.event === "QuorumReached") {
    const row = printRow(state, event);
    row.candidate = int(event, "candidate");
    return;
  }
  if (event.contract === "PrintOracle" && event.event === "PrintFinalized") {
    const row = printRow(state, event);
    row.price = int(event, "price");
    row.finalized = true;
    return;
  }
  if (event.contract === "PrintOracle" && event.event === "DisputeResolved") {
    const row = printRow(state, event);
    if (flag(event, "upheld")) {
      row.voided = true;
      row.finalized = false;
      row.price = null;
    }
    return;
  }
  if (event.contract === "UnderwritingVault" && event.event === "Allocated") {
    const row = market(state, hexId(event, "marketId"));
    row.underwritingPairs += int(event, "pairs");
    return;
  }
  if (event.contract === "UnderwritingVault" && event.event === "PremiumRecorded") {
    const ticker = hexId(event, "ticker");
    state.premiums.set(ticker, (state.premiums.get(ticker) ?? 0n) + int(event, "amount"));
    return;
  }
  if (event.contract === "ClosureNote" && event.event === "Transfer") {
    applyTransfer(state, event);
    return;
  }
  if (event.contract === "KuruOrderBook" && event.event === "BookUpdatesPacked") {
    applyBook(state, event);
    return;
  }
  if (event.contract === "KuruOrderBook" && event.event === "TradesPacked") {
    applyTrades(state, event);
  }
}

function printRow(state: State, event: LogEvent): PrintRow {
  const ticker = hexId(event, "ticker");
  const sessionId = int(event, "sessionId");
  const kind = kindOf(arg(event, "kind"));
  const printId = `${ticker}:${sessionId}:${kind}`;
  const existing = state.prints.get(printId);
  if (existing) return existing;
  const row: PrintRow = {
    ticker,
    sessionId,
    kind,
    price: null,
    candidate: null,
    finalized: false,
    voided: false,
  };
  state.prints.set(printId, row);
  return row;
}

function quoteFor(state: State, book: string | null): ReturnType<typeof quoteBook> | null {
  if (!book) return null;
  const levels = state.books.get(book);
  if (!levels) return null;
  return quoteBook(levels);
}

export function snapshot(events: readonly LogEvent[]): Snapshot {
  const state = emptyState();
  const ordered = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
  );
  for (const event of ordered) apply(state, event);

  const sessions: SessionView[] = [...state.sessions.values()]
    .sort((a, b) => (a.sessionId < b.sessionId ? -1 : 1))
    .map((row) => ({
      sessionId: row.sessionId.toString(),
      exchange: row.exchange,
      closeTs: row.closeTs.toString(),
      openTs: row.openTs.toString(),
      fallbackDeadline: row.fallbackDeadline.toString(),
      printBandSecs: row.printBandSecs.toString(),
      noAuction: row.noAuction,
      successorId: row.successorId?.toString() ?? null,
      marketIds: [...state.markets.values()]
        .filter((marketRow) => marketRow.sessionId === row.sessionId)
        .map((marketRow) => marketRow.marketId),
    }));

  const markets: MarketView[] = [...state.markets.values()].map((row) => {
    const up = quoteFor(state, row.bookUp);
    const midUp = up?.mid === null || up?.mid === undefined ? null : bookPriceToWad(up.mid);
    const premium = midUp === null ? null : midUp - neutralSplit(row.kUp, row.kDn);
    return {
      marketId: row.marketId,
      ticker: row.ticker,
      tickerLabel: tickerLabel(row.ticker),
      sessionId: row.sessionId.toString(),
      kUp: row.kUp.toString(),
      kDn: row.kDn.toString(),
      collateral: row.collateral,
      noteUp: row.noteUp,
      noteDn: row.noteDn,
      bookUp: row.bookUp,
      bookDn: row.bookDn,
      state: row.state,
      sUp: row.sUp?.toString() ?? null,
      fallbackSettle: row.fallbackSettle,
      midUp: midUp?.toString() ?? null,
      bidUp: up?.bid === null || up?.bid === undefined ? null : bookPriceToWad(up.bid).toString(),
      askUp: up?.ask === null || up?.ask === undefined ? null : bookPriceToWad(up.ask).toString(),
      depthBid: (up?.depthBid ?? 0n).toString(),
      depthAsk: (up?.depthAsk ?? 0n).toString(),
      impliedPremium: premium?.toString() ?? null,
      underwritingPairs: row.underwritingPairs.toString(),
      collateralHeld: row.collateralHeld.toString(),
      tradeCount: row.tradeCount,
      bookError: row.bookError,
    };
  });

  const positions: PositionView[] = [];
  const byAccount = new Map<string, Map<string, { up: bigint; dn: bigint }>>();
  for (const [note, holders] of state.balances) {
    const meta = state.notes.get(note);
    if (!meta) continue;
    for (const [account, balance] of holders) {
      if (balance === 0n) continue;
      const accounts = byAccount.get(account) ?? new Map();
      const legs = accounts.get(meta.marketId) ?? { up: 0n, dn: 0n };
      legs[meta.leg] = balance;
      accounts.set(meta.marketId, legs);
      byAccount.set(account, accounts);
    }
  }
  for (const [account, accounts] of byAccount) {
    for (const [marketId, legs] of accounts) {
      positions.push({
        account,
        marketId,
        up: legs.up.toString(),
        dn: legs.dn.toString(),
      });
    }
  }

  const prints: PrintView[] = [...state.prints.values()].map((row) => ({
    ticker: row.ticker,
    tickerLabel: tickerLabel(row.ticker),
    sessionId: row.sessionId.toString(),
    kind: row.kind,
    price: row.price?.toString() ?? null,
    candidate: row.candidate?.toString() ?? null,
    finalized: row.finalized,
    voided: row.voided,
  }));

  const settlements: SettlementView[] = [...state.settlements.values()].map((row) => ({
    marketId: row.marketId,
    sUp: row.sUp.toString(),
    fallbackSettle: row.fallbackSettle,
    blockNumber: row.blockNumber,
  }));

  const gaps: GapView[] = [];
  const seenGaps = new Set<string>();
  for (const row of state.markets.values()) {
    if (row.sUp === null) continue;
    const close = finalizedPrint(state, row.ticker, row.sessionId, "close");
    const open = finalizedPrint(state, row.ticker, row.sessionId, "open");
    if (close === null || open === null) continue;
    const id = `${row.ticker}:${row.sessionId}`;
    if (seenGaps.has(id)) continue;
    seenGaps.add(id);
    const gap = (open * WAD) / close - WAD;
    gaps.push({
      ticker: row.ticker,
      tickerLabel: tickerLabel(row.ticker),
      sessionId: row.sessionId.toString(),
      gap: gap.toString(),
    });
  }

  const surfaces = surfacesOf(markets, state.premiums, state.lastBlock);
  return { sessions, markets, positions, prints, settlements, gaps, surfaces };
}

function finalizedPrint(
  state: State,
  ticker: string,
  sessionId: bigint,
  kind: "close" | "open",
): bigint | null {
  const row = state.prints.get(`${ticker}:${sessionId}:${kind}`);
  if (!row || !row.finalized || row.voided || row.price === null) return null;
  return row.price;
}

function surfacesOf(
  markets: MarketView[],
  premiums: Map<string, bigint>,
  blockNumber: number,
): SurfaceView[] {
  const byTicker = new Map<string, MarketView[]>();
  for (const row of markets) {
    const list = byTicker.get(row.ticker) ?? [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }
  const surfaces: SurfaceView[] = [];
  for (const [ticker, rows] of byTicker) {
    const mids: CapMid[] = [];
    for (const row of rows) {
      if (row.midUp === null) continue;
      mids.push({ kUp: BigInt(row.kUp), kDn: BigInt(row.kDn), midUp: BigInt(row.midUp) });
    }
    const label = tickerLabel(ticker);
    const premium = (premiums.get(ticker) ?? 0n).toString();
    if (mids.length < 2) {
      surfaces.push({
        ticker,
        tickerLabel: label,
        blockNumber,
        above: [],
        below: [],
        asymmetry: [],
        premium,
        reason:
          mids.length === 0
            ? "No two-sided UP book is indexed for this ticker."
            : "One quoted cap is indexed. The surface needs two.",
      });
      continue;
    }
    const surface = extractSurface(mids);
    const point = (cap: bigint, probability: bigint) => ({
      cap: cap.toString(),
      probability: probability.toString(),
    });
    surfaces.push({
      ticker,
      tickerLabel: label,
      blockNumber,
      above: surface.above.map((item) => point(item.cap, item.probability)),
      below: surface.below.map((item) => point(item.cap, item.probability)),
      asymmetry: surface.asymmetry.map((item) => point(item.cap, item.probability)),
      premium,
      reason: null,
    });
  }
  return surfaces;
}

export function noteBalances(events: readonly LogEvent[]): NoteBalance[] {
  const state = emptyState();
  const ordered = [...events].sort(
    (a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex,
  );
  for (const event of ordered) apply(state, event);
  const rows: NoteBalance[] = [];
  for (const [note, holders] of state.balances) {
    const meta = state.notes.get(note);
    if (!meta) continue;
    for (const [account, balance] of holders) {
      rows.push({ account, note, marketId: meta.marketId, leg: meta.leg, balance });
    }
  }
  return rows;
}

export function collateralHeld(events: readonly LogEvent[], marketId: string): bigint {
  const row = snapshot(events).markets.find((marketRow) => marketRow.marketId === marketId);
  if (!row) throw new Error(`market ${marketId} is not indexed`);
  return BigInt(row.collateralHeld);
}

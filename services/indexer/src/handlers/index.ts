// Envio loads this file after `envio codegen`. It is excluded from `tsc` so a missing
// `envio` install does not fail the workspace typecheck. Do not start a sync until
// VIGIL_* addresses and VIGIL_START_BLOCK are set from a real deployment.
import { indexer } from "envio";
import { neutralSplit, WAD } from "@vigil/sdk";
import { applyPackedBook, bookFromJson, bookToJson, quoteBook } from "../book.js";

const PRICE = 1_000_000n;

function toWad(price: bigint): bigint {
  return (price * WAD) / PRICE;
}

indexer.contractRegister(
  { contract: "ClosureMarketFactory", event: "MarketCreated" },
  ({ event, context }) => {
    context.chain.ClosureNote.add(event.params.noteUp);
    context.chain.ClosureNote.add(event.params.noteDn);
  },
);

indexer.contractRegister(
  { contract: "KuruListingAdapter", event: "ListingBound" },
  ({ event, context }) => {
    context.chain.KuruOrderBook.add(event.params.bookUp);
    context.chain.KuruOrderBook.add(event.params.bookDn);
  },
);

indexer.onEvent({ contract: "SessionRegistry", event: "SessionStored" }, async ({ event, context }) => {
  const id = event.params.sessionId.toString();
  context.Session.set({
    id,
    exchange: event.params.exchange,
    closeTs: event.params.closeTs,
    openTs: event.params.openTs,
    fallbackDeadline: event.params.fallbackDeadline,
    printBandSecs: Number(event.params.printBandSecs),
    noAuction: false,
    successorId: undefined,
    marketCount: 0,
  });
});

indexer.onEvent(
  { contract: "SessionRegistry", event: "NoAuctionDeclared" },
  async ({ event, context }) => {
    const id = event.params.sessionId.toString();
    const row = await context.Session.get(id);
    if (!row) return;
    context.Session.set({ ...row, noAuction: true });
  },
);

indexer.onEvent({ contract: "SessionRegistry", event: "SuccessorSet" }, async ({ event, context }) => {
  const id = event.params.sessionId.toString();
  const row = await context.Session.get(id);
  if (!row) return;
  context.Session.set({ ...row, successorId: event.params.successorId });
});

indexer.onEvent(
  { contract: "ClosureMarketFactory", event: "MarketCreated" },
  async ({ event, context }) => {
    const id = event.params.marketId.toLowerCase();
    const sessionId = event.params.sessionId.toString();
    context.Market.set({
      id,
      ticker: event.params.ticker.toLowerCase(),
      tickerLabel: event.params.ticker,
      sessionId: event.params.sessionId,
      kUp: event.params.kUp,
      kDn: event.params.kDn,
      collateral: event.params.collateral.toLowerCase(),
      noteUp: event.params.noteUp.toLowerCase(),
      noteDn: event.params.noteDn.toLowerCase(),
      bookUp: undefined,
      bookDn: undefined,
      state: "Unset",
      sUp: undefined,
      fallbackSettle: undefined,
      midUp: undefined,
      bidUp: undefined,
      askUp: undefined,
      depthBid: 0n,
      depthAsk: 0n,
      impliedPremium: undefined,
      underwritingPairs: 0n,
      collateralHeld: 0n,
      tradeCount: 0,
      bookJson: "[]",
      bookError: undefined,
    });
    const session = await context.Session.get(sessionId);
    if (session) context.Session.set({ ...session, marketCount: session.marketCount + 1 });
  },
);

indexer.onEvent(
  { contract: "SettlementEngine", event: "MarketRegistered" },
  async ({ event, context }) => {
    const id = event.params.marketId.toLowerCase();
    const row = await context.Market.get(id);
    if (!row) return;
    context.Market.set({ ...row, state: "Trading" });
  },
);

indexer.onEvent({ contract: "SettlementEngine", event: "Halted" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  context.Market.set({ ...row, state: "Halted" });
});

indexer.onEvent({ contract: "SettlementEngine", event: "Finalized" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  const fallbackSettle = event.params.fallbackSettle;
  context.Market.set({
    ...row,
    sUp: event.params.sUp,
    fallbackSettle,
    state: fallbackSettle ? "FallbackFinalized" : "Finalized",
  });
  context.Settlement.set({
    id,
    marketId: id,
    sUp: event.params.sUp,
    fallbackSettle,
    blockNumber: event.block.number,
  });
});

indexer.onEvent({ contract: "ClosureVault", event: "Minted" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  context.Market.set({ ...row, collateralHeld: row.collateralHeld + event.params.pairs });
});

indexer.onEvent({ contract: "ClosureVault", event: "Burned" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  context.Market.set({ ...row, collateralHeld: row.collateralHeld - event.params.pairs });
});

indexer.onEvent({ contract: "ClosureVault", event: "Redeemed" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  context.Market.set({ ...row, collateralHeld: row.collateralHeld - event.params.payout });
});

indexer.onEvent({ contract: "KuruListingAdapter", event: "ListingBound" }, async ({ event, context }) => {
  const id = event.params.marketId.toLowerCase();
  const row = await context.Market.get(id);
  if (!row) return;
  context.Market.set({
    ...row,
    bookUp: event.params.bookUp.toLowerCase(),
    bookDn: event.params.bookDn.toLowerCase(),
  });
});

indexer.onEvent({ contract: "PrintOracle", event: "PrintFinalized" }, async ({ event, context }) => {
  const kind = event.params.kind === 0 ? "close" : "open";
  const id = `${event.params.ticker.toLowerCase()}:${event.params.sessionId}:${kind}`;
  context.Print.set({
    id,
    ticker: event.params.ticker.toLowerCase(),
    sessionId: event.params.sessionId,
    kind,
    price: event.params.price,
    candidate: undefined,
    finalized: true,
    voided: false,
  });
});

indexer.onEvent({ contract: "ClosureNote", event: "Transfer" }, async ({ event, context }) => {
  const note = event.srcAddress.toLowerCase();
  const markets = await context.Market.getWhere.noteUp.eq(note);
  const dn = markets.length === 0 ? await context.Market.getWhere.noteDn.eq(note) : [];
  const market = markets[0] ?? dn[0];
  if (!market) return;
  const leg = market.noteUp === note ? "up" : "dn";
  const from = event.params.from.toLowerCase();
  const to = event.params.to.toLowerCase();
  const value = event.params.value;
  const zero = "0x0000000000000000000000000000000000000000";
  for (const account of [from, to]) {
    if (account === zero) continue;
    const id = `${account}:${market.id}`;
    const position = (await context.Position.get(id)) ?? {
      id,
      account,
      marketId: market.id,
      up: 0n,
      dn: 0n,
    };
    const delta = account === to ? value : -value;
    context.Position.set({ ...position, [leg]: position[leg] + delta });
  }
});

indexer.onEvent(
  { contract: "KuruOrderBook", event: "BookUpdatesPacked" },
  async ({ event, context }) => {
    const bookAddress = event.srcAddress.toLowerCase();
    const up = await context.Market.getWhere.bookUp.eq(bookAddress);
    const dn = up.length === 0 ? await context.Market.getWhere.bookDn.eq(bookAddress) : [];
    const market = up[0] ?? dn[0];
    if (!market || market.bookUp !== bookAddress) return;
    const book = bookFromJson(market.bookJson);
    applyPackedBook(book, event.params.packedUpdates);
    const quote = quoteBook(book);
    const midUp = quote.mid === null ? undefined : toWad(quote.mid);
    context.Market.set({
      ...market,
      bookJson: bookToJson(book),
      midUp,
      bidUp: quote.bid === null ? undefined : toWad(quote.bid),
      askUp: quote.ask === null ? undefined : toWad(quote.ask),
      depthBid: quote.depthBid,
      depthAsk: quote.depthAsk,
      impliedPremium: midUp === undefined ? undefined : midUp - neutralSplit(market.kUp, market.kDn),
      bookError: undefined,
    });
  },
);

export type LogEvent = {
  contract: string;
  event: string;
  blockNumber: number;
  logIndex: number;
  address: string;
  args: Record<string, string>;
};

export type SessionView = {
  sessionId: string;
  exchange: string;
  closeTs: string;
  openTs: string;
  fallbackDeadline: string;
  printBandSecs: string;
  noAuction: boolean;
  successorId: string | null;
  marketIds: string[];
};

export type MarketView = {
  marketId: string;
  ticker: string;
  tickerLabel: string;
  sessionId: string;
  kUp: string;
  kDn: string;
  collateral: string;
  noteUp: string;
  noteDn: string;
  bookUp: string | null;
  bookDn: string | null;
  state: string;
  sUp: string | null;
  fallbackSettle: boolean | null;
  midUp: string | null;
  bidUp: string | null;
  askUp: string | null;
  depthBid: string;
  depthAsk: string;
  impliedPremium: string | null;
  underwritingPairs: string;
  collateralHeld: string;
  tradeCount: number;
  bookError: string | null;
};

export type PositionView = {
  account: string;
  marketId: string;
  up: string;
  dn: string;
};

export type PrintView = {
  ticker: string;
  tickerLabel: string;
  sessionId: string;
  kind: "close" | "open";
  price: string | null;
  candidate: string | null;
  finalized: boolean;
  voided: boolean;
};

export type SettlementView = {
  marketId: string;
  sUp: string;
  fallbackSettle: boolean;
  blockNumber: number;
};

export type GapView = {
  ticker: string;
  tickerLabel: string;
  sessionId: string;
  gap: string;
};

export type TailView = { cap: string; probability: string };

export type SurfaceView = {
  ticker: string;
  tickerLabel: string;
  blockNumber: number;
  above: TailView[];
  below: TailView[];
  asymmetry: TailView[];
  premium: string;
  reason: string | null;
};

export type Snapshot = {
  sessions: SessionView[];
  markets: MarketView[];
  positions: PositionView[];
  prints: PrintView[];
  settlements: SettlementView[];
  gaps: GapView[];
  surfaces: SurfaceView[];
};

export type NoteBalance = {
  account: string;
  note: string;
  marketId: string;
  leg: "up" | "dn";
  balance: bigint;
};

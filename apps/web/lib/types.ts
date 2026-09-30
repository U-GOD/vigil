export type ApiMeta = {
  chainId: number;
  policy: string | null;
  contractsDeployed: boolean;
  reason: string | null;
  elapsedMs?: number;
  error?: string;
};

export type MarketRow = {
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
  bookError: string | null;
};

export type SessionRow = {
  sessionId: string;
  exchange: string;
  closeTs: string;
  openTs: string;
  fallbackDeadline: string;
  printBandSecs: string;
  noAuction: boolean;
  successorId: string | null;
};

export type PositionRow = {
  account: string;
  marketId: string;
  up: string;
  dn: string;
};

export type PrintRow = {
  ticker: string;
  tickerLabel: string;
  sessionId: string;
  kind: "close" | "open";
  price: string | null;
  candidate: string | null;
  finalized: boolean;
  voided: boolean;
};

export type SettlementRow = {
  marketId: string;
  sUp: string;
  fallbackSettle: boolean;
  blockNumber: number;
};

export type TailRow = { cap: string; probability: string };

export type MarketsResponse = ApiMeta & { markets: MarketRow[] };

export type SessionResponse = ApiMeta & {
  session: SessionRow | null;
  markets: MarketRow[];
  prints: PrintRow[];
  settlements: SettlementRow[];
};

export type PositionsResponse = ApiMeta & { account: string; positions: PositionRow[] };

export type FairResponse = ApiMeta & {
  marketId: string;
  close?: string;
  anchor?: string;
  fairValueUp: string | null;
  fairValueDn: string | null;
  detail: string;
};

export type SurfaceResponse = ApiMeta & {
  ticker: string;
  surface: { above: TailRow[]; below: TailRow[]; asymmetry: TailRow[] } | null;
  premium?: string;
  detail: string | null;
};

/** A price that names where it came from. Callers must not drop `source`. */
export type SourcedPrice = {
  price: bigint;
  timestampMs: number;
  source: string;
};

export type SessionPrints = {
  close: SourcedPrice;
  open: SourcedPrice;
};

export interface MarketData {
  readonly source: string;
  getQuote(ticker: string, at: number): Promise<SourcedPrice>;
  getSeries(ticker: string, from: number, to: number): Promise<SourcedPrice[]>;
  getSessionPrints(ticker: string, sessionId: number): Promise<SessionPrints>;
}

export class MarketDataError extends Error {
  constructor(
    message: string,
    readonly source: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MarketDataError";
  }
}

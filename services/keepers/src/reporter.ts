export type PrintKind = "close" | "open";

export type SessionWindow = {
  sessionId: number;
  closeTs: number;
  openTs: number;
  printBandSecs: number;
};

export type SourcedPrint = {
  price: bigint;
  timestampMs: number;
  source: string;
};

export type SubmitIntent = {
  ticker: string;
  sessionId: number;
  kind: PrintKind;
  price: bigint;
  source: string;
};

/** Submit only inside the print band, and only with a sourced positive price. */
export function reporterIntent(
  ticker: string,
  session: SessionWindow,
  kind: PrintKind,
  nowSec: number,
  print: SourcedPrint,
): SubmitIntent | null {
  if (!print.source || print.price <= 0n) {
    throw new Error("print is missing a source or a positive price");
  }
  const center = kind === "close" ? session.closeTs : session.openTs;
  const delta = nowSec > center ? nowSec - center : center - nowSec;
  if (delta > session.printBandSecs) return null;
  return {
    ticker,
    sessionId: session.sessionId,
    kind,
    price: print.price,
    source: print.source,
  };
}

/** The Pyth path submits an update blob. An empty blob is not a price. */
export function pythReportIntent(update: `0x${string}`): `0x${string}` {
  if (!update || update === "0x") throw new Error("Pyth update is empty");
  return update;
}

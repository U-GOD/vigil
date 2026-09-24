import { createCoinGecko, createJupiter, createYahoo } from "@vigil/marketdata";
import { noArbBand } from "./band.js";
import { fairValueDn, fairValueUp } from "./fairValue.js";

const WAD = 10n ** 18n;
const K10 = WAD / 10n;
const K25 = (WAD * 25n) / 100n;
const DIVERGENCE_BPS = 50n;

export type LiveBand = {
  ticker: string;
  pClose: { price: bigint; timestampMs: number; source: string };
  anchor: { price: bigint; timestampMs: number; source: string };
  legs: { source: string; price: bigint; timestampMs: number }[];
  caps: { k: bigint; up: bigint; dn: bigint; low: bigint; high: bigint }[];
};

export async function liveFairValue(ticker: string): Promise<LiveBand> {
  const gecko = createCoinGecko();
  const jupiter = createJupiter();
  const yahoo = createYahoo();
  const [left, right, close] = await Promise.all([
    gecko.getQuote(ticker, Date.now()),
    jupiter.getQuote(ticker, Date.now()),
    yahoo.getQuote(ticker, Date.now()),
  ]);
  const diff = left.price > right.price ? left.price - right.price : right.price - left.price;
  const mid = (left.price + right.price) / 2n;
  if (diff * 10_000n > mid * DIVERGENCE_BPS) {
    throw new Error(
      `anchor divergence ${left.source} vs ${right.source}: refusing to price ${ticker}`,
    );
  }
  const anchor = {
    price: mid,
    timestampMs: Math.min(left.timestampMs, right.timestampMs),
    source: `${left.source}+${right.source}`,
  };
  const caps = [K10, K25].map((k) => {
    const up = fairValueUp(anchor.price, close.price, WAD, k, k, 0n);
    const dn = fairValueDn(anchor.price, close.price, WAD, k, k);
    const band = noArbBand(up, 7000n, 1_000_000_000_000_000n, 0n);
    return { k, up, dn, low: band.low, high: band.high };
  });
  return {
    ticker,
    pClose: close,
    anchor,
    legs: [left, right],
    caps,
  };
}

function wad(value: bigint): string {
  const whole = value / WAD;
  const frac = (value % WAD).toString().padStart(18, "0").slice(0, 6);
  return `${whole}.${frac}`;
}

export async function main(argv: string[]): Promise<void> {
  const ticker = argv[2] ?? "NVDA";
  const band = await liveFairValue(ticker);
  console.log(
    JSON.stringify(
      {
        ticker: band.ticker,
        note: "Model band for an unbound Closure Note. No Kuru CN book is registered.",
        pClose: { ...band.pClose, price: wad(band.pClose.price) },
        anchor: { ...band.anchor, price: wad(band.anchor.price) },
        legs: band.legs.map((leg) => ({ ...leg, price: wad(leg.price) })),
        caps: band.caps.map((cap) => ({
          k: wad(cap.k),
          fairUp: wad(cap.up),
          fairDn: wad(cap.dn),
          low: wad(cap.low),
          high: wad(cap.high),
        })),
      },
      null,
      2,
    ),
  );
}

if (process.argv[1]?.endsWith("cli.js")) {
  main(process.argv).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

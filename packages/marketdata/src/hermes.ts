import { MarketDataError, type MarketData, type SessionPrints, type SourcedPrice } from "./types.js";
import { readJson, sessionDate, usdToWad } from "./price.js";

const HERMES = "https://hermes.pyth.network";

/** Equity.US session feeds. Equity.Index feeds are not settlement prints. */
export const EQUITY_FEEDS: Record<string, string> = {
  NVDA: "0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593",
  AAPL: "0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688",
  TSLA: "0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1",
  MSFT: "0xd0ca23c1cc005e004ccf1db5bf76aeb6a49218f43dac3d4b275e92de12ded4d1",
  AMZN: "0xb5d0e0fa58a1f8b81498ae670ce93c872d14434b72c364885d4fa1b257cbb07a",
  GOOG: "0xe65ff435be42630439c96396653a342829e877e2aafaeaf1a10d0ee5fd2cf3f2",
};

export const CRYPTO_FEEDS: Record<string, string> = {
  MON: "0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1",
};

type HermesFeed = {
  id: string;
  market_hours?: { is_open?: boolean; next_open?: number; next_close?: number };
  price?: { price?: string; expo?: number; publish_time?: number };
};

function feedId(ticker: string): string {
  const id = EQUITY_FEEDS[ticker] ?? CRYPTO_FEEDS[ticker];
  if (!id) throw new MarketDataError(`no Pyth feed for ${ticker}`, "pyth-hermes");
  return id;
}

async function latest(ticker: string, apiKey?: string): Promise<HermesFeed> {
  const id = feedId(ticker);
  const headers: Record<string, string> = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const url = `${HERMES}/v2/updates/price/latest?ids[]=${id}&parsed=true`;
  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    throw new MarketDataError(`hermes unreachable: ${String(error)}`, "pyth-hermes");
  }
  if (response.status === 401) {
    throw new MarketDataError(
      "Hermes price updates returned 401. Metadata is public; a price is not.",
      "pyth-hermes",
      401,
    );
  }
  if (!response.ok) {
    throw new MarketDataError(`hermes ${response.status}`, "pyth-hermes", response.status);
  }
  const body = (await response.json()) as { parsed?: HermesFeed[] };
  const row = body.parsed?.[0];
  if (!row?.price?.price || row.price.expo === undefined || !row.price.publish_time) {
    throw new MarketDataError("hermes parsed price missing", "pyth-hermes");
  }
  return row;
}

function toPrice(row: HermesFeed): SourcedPrice {
  const price = row.price;
  if (!price?.price || price.expo === undefined || !price.publish_time) {
    throw new MarketDataError("hermes parsed price missing", "pyth-hermes");
  }
  const expo = price.expo;
  if (expo < -18 || expo > 12) throw new MarketDataError("hermes expo out of range", "pyth-hermes");
  const raw = BigInt(price.price);
  if (raw <= 0n) throw new MarketDataError("hermes price not positive", "pyth-hermes");
  const scale = 10n ** BigInt(expo + 18);
  return {
    price: raw * scale,
    timestampMs: price.publish_time * 1000,
    source: "pyth-hermes",
  };
}

export function createHermes(apiKey = process.env.HERMES_API_KEY): MarketData {
  return {
    source: "pyth-hermes",
    async getQuote(ticker: string, at: number): Promise<SourcedPrice> {
      const row = await latest(ticker, apiKey);
      const quote = toPrice(row);
      if (at > 0 && quote.timestampMs > at + 60_000) {
        throw new MarketDataError("hermes publish time is after the requested instant", "pyth-hermes");
      }
      return quote;
    },
    async getSeries(ticker: string, from: number, to: number): Promise<SourcedPrice[]> {
      const id = feedId(ticker).slice(2);
      const url =
        `${HERMES}/v2/updates/price/${Math.floor(from / 1000)}` +
        `?ids[]=${feedId(ticker)}&parsed=true&end_time=${Math.floor(to / 1000)}`;
      void id;
      void url;
      throw new MarketDataError(
        "Hermes history requires an authorized benchmark query. No series is invented.",
        "pyth-hermes",
        401,
      );
    },
    async getSessionPrints(ticker: string, sessionId: number): Promise<SessionPrints> {
      void ticker;
      void sessionId;
      throw new MarketDataError(
        "Equity.US Hermes updates are not authorized. Official prints come from the vendor adapter.",
        "pyth-hermes",
        401,
      );
    },
  };
}

export async function hermesSchedule(ticker: string): Promise<{
  isOpen: boolean;
  nextOpen: number;
  nextClose: number;
  source: string;
}> {
  const id = feedId(ticker);
  const body = (await readJson(
    `${HERMES}/v2/price_feeds?query=Equity.US.${ticker}&asset_type=equity`,
  )) as HermesFeed[];
  const row = body.find((feed) => `0x${feed.id}` === id || feed.id === id.slice(2));
  const hours = row?.market_hours;
  if (!hours || hours.next_open === undefined || hours.next_close === undefined) {
    throw new MarketDataError(`no Hermes schedule for ${ticker}`, "pyth-hermes");
  }
  return {
    isOpen: hours.is_open === true,
    nextOpen: hours.next_open,
    nextClose: hours.next_close,
    source: "pyth-hermes",
  };
}

export function polygonDate(sessionId: number): string {
  return sessionDate(sessionId);
}

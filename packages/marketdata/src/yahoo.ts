import { MarketDataError, type MarketData, type SessionPrints, type SourcedPrice } from "./types.js";
import { readJson, sessionDate, usdToWad } from "./price.js";

type YahooChart = {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number; regularMarketTime?: number };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: Array<number | null>; close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
};

const headers = { "user-agent": "vigil-marketdata" };

async function chart(ticker: string, range: string): Promise<YahooChart> {
  return (await readJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=${range}`,
    { headers },
  )) as YahooChart;
}

function bars(body: YahooChart): { ts: number; open: number; close: number }[] {
  const result = body.chart?.result?.[0];
  if (!result || body.chart?.error) {
    throw new MarketDataError("yahoo chart missing", "yahoo-chart");
  }
  const times = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0];
  const out = [];
  for (let i = 0; i < times.length; i += 1) {
    const ts = times[i];
    const open = quote?.open?.[i];
    const close = quote?.close?.[i];
    if (ts && open && close && open > 0 && close > 0) out.push({ ts, open, close });
  }
  return out;
}

export function createYahoo(): MarketData {
  return {
    source: "yahoo-chart",
    async getQuote(ticker: string): Promise<SourcedPrice> {
      const body = await chart(ticker, "5d");
      const meta = body.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice || !meta.regularMarketTime) {
        throw new MarketDataError(`yahoo quote missing for ${ticker}`, "yahoo-chart");
      }
      return {
        price: usdToWad(meta.regularMarketPrice),
        timestampMs: meta.regularMarketTime * 1000,
        source: "yahoo-chart",
      };
    },
    async getSeries(ticker, from, to): Promise<SourcedPrice[]> {
      const body = await chart(ticker, "1y");
      return bars(body)
        .filter((bar) => bar.ts * 1000 >= from && bar.ts * 1000 <= to)
        .map((bar) => ({
          price: usdToWad(bar.close),
          timestampMs: bar.ts * 1000,
          source: "yahoo-chart",
        }));
    },
    async getSessionPrints(ticker, sessionId): Promise<SessionPrints> {
      const day = sessionDate(sessionId);
      const body = await chart(ticker, "1mo");
      const found = bars(body).filter((bar) => etDate(bar.ts) === day);
      const bar = found[0];
      if (!bar) throw new MarketDataError(`yahoo has no bar for ${ticker} ${day}`, "yahoo-chart");
      const next = bars(body).find((item) => item.ts > bar.ts);
      if (!next) {
        throw new MarketDataError(
          `yahoo has no opening print after ${day}. The close is published; the open is not.`,
          "yahoo-chart",
        );
      }
      return {
        close: { price: usdToWad(bar.close), timestampMs: bar.ts * 1000, source: "yahoo-chart" },
        open: { price: usdToWad(next.open), timestampMs: next.ts * 1000, source: "yahoo-chart" },
      };
    },
  };
}

function etDate(unixSeconds: number): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date(unixSeconds * 1000));
}

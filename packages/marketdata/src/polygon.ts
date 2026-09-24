import { MarketDataError, type MarketData, type SessionPrints, type SourcedPrice } from "./types.js";
import { readJson, sessionDate, usdToWad } from "./price.js";

type OpenClose = { open?: number; close?: number; from?: string };

export function createPolygon(apiKey = process.env.POLYGON_IO_API_KEY): MarketData {
  const key = apiKey ?? "";
  return {
    source: "polygon-open-close",
    async getQuote(ticker, at): Promise<SourcedPrice> {
      const day = new Date(at).toISOString().slice(0, 10);
      const print = await openClose(ticker, day, key);
      return {
        price: usdToWad(print.close),
        timestampMs: Date.parse(`${day}T20:00:00Z`),
        source: "polygon-open-close",
      };
    },
    async getSeries(ticker, from, to): Promise<SourcedPrice[]> {
      if (!key) throw new MarketDataError("POLYGON_IO_API_KEY is unset", "polygon-open-close");
      const start = new Date(from).toISOString().slice(0, 10);
      const end = new Date(to).toISOString().slice(0, 10);
      const body = (await readJson(
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${start}/${end}?adjusted=true&sort=asc&apiKey=${key}`,
      )) as { results?: { c?: number; t?: number }[] };
      return (body.results ?? [])
        .filter((bar) => bar.c && bar.t)
        .map((bar) => ({
          price: usdToWad(bar.c as number),
          timestampMs: bar.t as number,
          source: "polygon-open-close",
        }));
    },
    async getSessionPrints(ticker, sessionId): Promise<SessionPrints> {
      const day = sessionDate(sessionId);
      const closeBar = await openClose(ticker, day, key);
      return {
        close: {
          price: usdToWad(closeBar.close),
          timestampMs: Date.parse(`${day}T20:00:00Z`),
          source: "polygon-open-close",
        },
        open: {
          price: usdToWad(closeBar.open),
          timestampMs: Date.parse(`${day}T13:30:00Z`),
          source: "polygon-open-close",
        },
      };
    },
  };
}

async function openClose(ticker: string, day: string, key: string): Promise<{ open: number; close: number }> {
  if (!key) throw new MarketDataError("POLYGON_IO_API_KEY is unset", "polygon-open-close");
  const body = (await readJson(
    `https://api.polygon.io/v1/open-close/${ticker}/${day}?adjusted=true&apiKey=${key}`,
  )) as OpenClose;
  if (!body.open || !body.close || body.open <= 0 || body.close <= 0) {
    throw new MarketDataError(`polygon open/close missing for ${ticker} ${day}`, "polygon-open-close");
  }
  return { open: body.open, close: body.close };
}

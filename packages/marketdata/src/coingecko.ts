import { MarketDataError, type MarketData, type SourcedPrice } from "./types.js";
import { readJson, usdToWad } from "./price.js";

/** CoinGecko ids for xStocks. These are off-hours anchors, not official prints. */
export const XSTOCK_IDS: Record<string, string> = {
  NVDA: "nvidia-xstock",
};

export function createCoinGecko(): MarketData {
  return {
    source: "coingecko-xstock",
    async getQuote(ticker: string): Promise<SourcedPrice> {
      const id = XSTOCK_IDS[ticker];
      if (!id) throw new MarketDataError(`no xStock id for ${ticker}`, "coingecko-xstock");
      const body = (await readJson(
        `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_last_updated_at=true`,
      )) as Record<string, { usd?: number; last_updated_at?: number }>;
      const row = body[id];
      if (!row?.usd || !row.last_updated_at) {
        throw new MarketDataError(`coingecko quote missing for ${ticker}`, "coingecko-xstock");
      }
      return {
        price: usdToWad(row.usd),
        timestampMs: row.last_updated_at * 1000,
        source: "coingecko-xstock",
      };
    },
    async getSeries(ticker, from, to): Promise<SourcedPrice[]> {
      const id = XSTOCK_IDS[ticker];
      if (!id) throw new MarketDataError(`no xStock id for ${ticker}`, "coingecko-xstock");
      const body = (await readJson(
        `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=usd&from=${Math.floor(from / 1000)}&to=${Math.floor(to / 1000)}`,
      )) as { prices?: [number, number][] };
      return (body.prices ?? []).map(([timestampMs, usd]) => ({
        price: usdToWad(usd),
        timestampMs,
        source: "coingecko-xstock",
      }));
    },
    async getSessionPrints(): Promise<never> {
      throw new MarketDataError(
        "CoinGecko xStock quotes are the off-hours anchor, not an official open or close.",
        "coingecko-xstock",
      );
    },
  };
}

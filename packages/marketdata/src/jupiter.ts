import { MarketDataError, type MarketData, type SourcedPrice } from "./types.js";
import { readJson, usdToWad } from "./price.js";

/** Verified xStock mints. Jupiter is the second off-hours anchor. */
export const XSTOCK_MINTS: Record<string, string> = {
  NVDA: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
};

type JupiterRow = {
  usdPrice?: number;
  stockData?: { price?: number; updatedAt?: string };
};

export function createJupiter(): MarketData {
  return {
    source: "jupiter-xstock",
    async getQuote(ticker: string): Promise<SourcedPrice> {
      const mint = XSTOCK_MINTS[ticker];
      if (!mint) throw new MarketDataError(`no xStock mint for ${ticker}`, "jupiter-xstock");
      const body = (await readJson(`https://lite-api.jup.ag/price/v3?ids=${mint}`)) as Record<
        string,
        JupiterRow
      >;
      const row = body[mint];
      const usd = row?.stockData?.price ?? row?.usdPrice;
      const updated = row?.stockData?.updatedAt;
      if (!usd || !updated) {
        throw new MarketDataError(`jupiter quote missing for ${ticker}`, "jupiter-xstock");
      }
      const timestampMs = Date.parse(updated);
      if (!Number.isFinite(timestampMs)) {
        throw new MarketDataError("jupiter timestamp missing", "jupiter-xstock");
      }
      return { price: usdToWad(usd), timestampMs, source: "jupiter-xstock" };
    },
    async getSeries(): Promise<SourcedPrice[]> {
      throw new MarketDataError("Jupiter price v3 is a spot quote, not a history.", "jupiter-xstock");
    },
    async getSessionPrints(): Promise<never> {
      throw new MarketDataError(
        "Jupiter xStock quotes are the off-hours anchor, not an official open or close.",
        "jupiter-xstock",
      );
    },
  };
}

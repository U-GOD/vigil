/** Closure Note book spec from `research/kuru-bounty/listing-request.md`. */
export const CN_BOOK_SPEC = {
  pricePrecision: 1_000_000,
  sizePrecision: 1_000_000,
  tickSize: 100,
  passiveSpreadTicks: 50,
  minQuoteNotional: 10_000_000n,
  maxQuoteNotional: 5_000_000_000_000n,
  takerFeePps: 7000n,
  makerFeePps: 4000n,
  baseSizeMultiplier: 1n,
} as const;

/** Live MON/USDC params read from the book. Size and tick differ from a CN book. */
export const MON_USDC_BOOK = {
  market: "0xD2F64EaF7E85688802d24C18ea268C365533b344",
  pricePrecision: 100_000_000,
  sizePrecision: 10_000_000_000,
  tickSize: 100,
  minQuoteNotional: 10_000_000n,
  maxQuoteNotional: 5_000_000_000_000n,
  takerFeePps: 2000n,
  makerFeePps: 0n,
} as const;

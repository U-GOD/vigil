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
  market: "0xfdbE356828c8f5A5d5ed4f69ddE0816f4058Ef61",
  pricePrecision: 1_000_000,
  sizePrecision: 100_000_000,
  tickSize: 1,
  minQuoteNotional: 10_000_000n,
  maxQuoteNotional: 5_000_000_000_000n,
  takerFeePps: 7000n,
  makerFeePps: 4000n,
} as const;

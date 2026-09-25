export type SpotQuote = {
  bid: bigint;
  ask: bigint;
  reference: bigint;
  source: string;
  timestampMs: number;
};

/** Two-sided spot-proxy quotes, or a cancel when the reference is stale. */
export function spotIntent(input: {
  verified: boolean;
  nowMs: number;
  staleMs: number;
  spreadBps: bigint;
  reference: { price: bigint; timestampMs: number; source: string };
  lastReference: bigint;
  moveBps: bigint;
}): { action: "refuse" | "cancel" | "quote" | "hold"; quote?: SpotQuote } {
  if (!input.verified) return { action: "refuse" };
  if (!input.reference.source || input.reference.price <= 0n) {
    throw new Error("spot reference has no source");
  }
  if (input.nowMs - input.reference.timestampMs > input.staleMs) {
    return { action: "cancel" };
  }
  const move =
    input.lastReference === 0n
      ? input.moveBps
      : (abs(input.reference.price - input.lastReference) * 10_000n) / input.lastReference;
  if (input.lastReference !== 0n && move < input.moveBps) return { action: "hold" };
  const half = (input.reference.price * input.spreadBps) / 10_000n / 2n;
  return {
    action: "quote",
    quote: {
      bid: input.reference.price - half,
      ask: input.reference.price + half,
      reference: input.reference.price,
      source: input.reference.source,
      timestampMs: input.reference.timestampMs,
    },
  };
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

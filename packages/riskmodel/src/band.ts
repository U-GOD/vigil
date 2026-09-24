import { WAD } from "@vigil/sdk";

/** Kuru takerFeePps 7000 is 0.07% of price. Denominator is 1e7. */
export const PPS_DENOMINATOR = 10_000_000n;

export type Band = { fair: bigint; low: bigint; high: bigint };

export function noArbBand(
  fair: bigint,
  takerFeePps: bigint,
  gasBuffer: bigint,
  inventoryBuffer: bigint,
): Band {
  const fee = (fair * takerFeePps) / PPS_DENOMINATOR;
  const half = fee + gasBuffer + inventoryBuffer;
  const low = fair > half ? fair - half : 0n;
  const high = fair + half > WAD ? WAD : fair + half;
  return { fair, low, high };
}

export function outsideBand(price: bigint, band: Band): "below" | "above" | "inside" {
  if (price < band.low) return "below";
  if (price > band.high) return "above";
  return "inside";
}

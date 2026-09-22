import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

export const WAD = 10n ** 18n;
export const MAX_CAP = WAD;
export const BPS_DENOMINATOR = 10_000n;

export function marketId(
  ticker: Hex,
  sessionId: bigint,
  kUp: bigint,
  kDn: bigint,
  collateral: Address,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "uint64" },
        { type: "address" },
      ],
      [ticker, sessionId, kUp, kDn, collateral],
    ),
  );
}

export function splitUp(
  pClose: bigint,
  pOpen: bigint,
  adj: bigint,
  kUp: bigint,
  kDn: bigint,
): bigint {
  if (pClose === 0n || adj === 0n) throw new Error("InvalidPrint");
  if (kUp > MAX_CAP || kDn > MAX_CAP || kUp + kDn === 0n) throw new Error("InvalidCap");

  const pOpenAdj = (pOpen * WAD) / adj;
  const range = kUp + kDn;
  let sUp: bigint;

  if (pOpenAdj >= pClose) {
    const r = ((pOpenAdj - pClose) * WAD) / pClose;
    const g = r > kUp ? kUp : r;
    sUp = ((g + kDn) * WAD) / range;
  } else {
    const r = ((pClose - pOpenAdj) * WAD) / pClose;
    const g = r > kDn ? kDn : r;
    sUp = ((kDn - g) * WAD) / range;
  }

  return sUp > WAD ? WAD : sUp;
}

export function neutralSplit(kUp: bigint, kDn: bigint): bigint {
  if (kUp > MAX_CAP || kDn > MAX_CAP || kUp + kDn === 0n) throw new Error("InvalidCap");
  return (kDn * WAD) / (kUp + kDn);
}

export function payoutUp(amount: bigint, sUp: bigint): bigint {
  if (sUp > WAD) throw new Error("InvalidAmount");
  return (amount * sUp) / WAD;
}

export function payoutDn(amount: bigint, sUp: bigint): bigint {
  if (sUp > WAD) throw new Error("InvalidAmount");
  return (amount * (WAD - sUp)) / WAD;
}

export function mintIn(pairs: bigint, mintFeeBps: bigint): { requiredIn: bigint; backing: bigint } {
  if (pairs === 0n) throw new Error("InvalidAmount");
  const backing = pairs;
  const requiredIn = (pairs * (BPS_DENOMINATOR + mintFeeBps)) / BPS_DENOMINATOR;
  return { requiredIn, backing };
}

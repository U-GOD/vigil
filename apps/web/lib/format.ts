import { keccak256, toBytes } from "viem";

const WAD = 10n ** 18n;

export type HoldingRisk = {
  paired: bigint;
  nakedUp: bigint;
  nakedDn: bigint;
  worstRedeem: bigint;
  nakedAtRisk: bigint;
};

/** A pair redeems one for one. A naked leg can redeem zero. */
export function holdingRisk(up: bigint, dn: bigint): HoldingRisk {
  if (up < 0n || dn < 0n) throw new Error("negative balance");
  const paired = up < dn ? up : dn;
  const nakedUp = up - paired;
  const nakedDn = dn - paired;
  return {
    paired,
    nakedUp,
    nakedDn,
    worstRedeem: paired,
    nakedAtRisk: nakedUp + nakedDn,
  };
}

export function units(raw: bigint, decimals = 6): string {
  const sign = raw < 0n ? "-" : "";
  const abs = raw < 0n ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = (abs % scale).toString().padStart(decimals, "0");
  return `${sign}${whole}.${frac}`;
}

export function wadPercent(value: string | null | undefined): string {
  if (value === null || value === undefined || !/^-?\d+$/.test(value)) return "n/a";
  const wad = BigInt(value);
  const sign = wad < 0n ? "-" : "";
  const abs = wad < 0n ? -wad : wad;
  const hundredths = (abs * 10_000n) / WAD;
  if (hundredths === 0n) return "0.00%";
  return `${sign}${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, "0")}%`;
}

/** Trading halts at the open that ends the closure window. */
export function timeToHalt(openTs: string | null | undefined, nowSec: number): string {
  if (!openTs || !/^\d+$/.test(openTs)) return "n/a";
  const delta = Number(openTs) - nowSec;
  if (!Number.isFinite(delta)) return "n/a";
  if (delta <= 0) return "due";
  const hours = Math.floor(delta / 3600);
  const minutes = Math.floor((delta % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function shortId(value: string): string {
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function capLabel(row: { kUp: string; kDn: string }): string {
  return `${wadPercent(row.kUp)} / ${wadPercent(row.kDn)}`;
}

const EXCHANGES = new Map(
  ["XNYS", "XNAS", "VIGIL_SYNTH"].map((name) => [keccak256(toBytes(name)), name]),
);

/** Exchange ids are keccak256 of the MIC. */
export function exchangeLabel(id: string): string {
  return EXCHANGES.get(id.toLowerCase() as `0x${string}`) ?? id;
}

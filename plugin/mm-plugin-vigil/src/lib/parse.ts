import { isAddress, type Address } from "viem";

export const CHAIN_ID = 10143;

export function parseAccount(raw: string | undefined): Address {
  if (!raw || !isAddress(raw)) throw new Error("account must be a 0x address");
  return raw;
}

export function parseInteger(raw: string | undefined, label: string): bigint {
  if (!raw || !/^\d+$/.test(raw)) throw new Error(`${label} must be a non-negative integer`);
  return BigInt(raw);
}

export function parseOptionalInteger(raw: string | undefined): bigint | null {
  if (!raw || raw.length === 0) return null;
  if (!/^\d+$/.test(raw)) throw new Error("expected a non-negative integer");
  return BigInt(raw);
}

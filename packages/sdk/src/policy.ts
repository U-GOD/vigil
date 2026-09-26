import type { Address, Hex } from "viem";
import type { RequestLike } from "./kuru/encode.js";

export const policyAdapterAbi = [
  {
    type: "function",
    name: "mintPair",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "pairs", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "burnPair",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "pairs", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "redeem",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "upAmt", type: "uint256" },
      { name: "dnAmt", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "buyProtection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "marketId", type: "bytes32" },
      { name: "notional", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "listings",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      { name: "allowed", type: "bool" },
      { name: "sessionId", type: "uint64" },
    ],
  },
] as const;

export function mintPairRequest(
  adapter: Address,
  marketId: Hex,
  pairs: bigint,
  to: Address,
): RequestLike {
  return {
    address: adapter,
    abi: policyAdapterAbi,
    functionName: "mintPair",
    args: [marketId, pairs, to],
  };
}

export function burnPairRequest(
  adapter: Address,
  marketId: Hex,
  pairs: bigint,
  to: Address,
): RequestLike {
  return {
    address: adapter,
    abi: policyAdapterAbi,
    functionName: "burnPair",
    args: [marketId, pairs, to],
  };
}

export function redeemRequest(
  adapter: Address,
  marketId: Hex,
  upAmt: bigint,
  dnAmt: bigint,
  to: Address,
): RequestLike {
  return {
    address: adapter,
    abi: policyAdapterAbi,
    functionName: "redeem",
    args: [marketId, upAmt, dnAmt, to],
  };
}

export function buyProtectionRequest(
  adapter: Address,
  marketId: Hex,
  notional: bigint,
): RequestLike {
  return {
    address: adapter,
    abi: policyAdapterAbi,
    functionName: "buyProtection",
    args: [marketId, notional],
  };
}

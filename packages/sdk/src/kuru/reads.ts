import type { Address } from "viem";
import { orderBookAbi } from "../abi.js";
import type { RequestLike } from "./encode.js";

export function bestBidAskRequest(market: Address): RequestLike {
  return { address: market, abi: orderBookAbi, functionName: "bestBidAsk" };
}

export function l2BookRequest(market: Address, levels: bigint): RequestLike {
  return {
    address: market,
    abi: orderBookAbi,
    functionName: "getL2Book",
    args: [levels],
  };
}

export function marketParamsRequest(market: Address): RequestLike {
  return { address: market, abi: orderBookAbi, functionName: "getMarketParams" };
}

export function orderIdRequest(
  market: Address,
  userId: bigint,
  slotIdx: number,
): RequestLike {
  return {
    address: market,
    abi: orderBookAbi,
    functionName: "getOrderId",
    args: [userId, slotIdx],
  };
}

export function marketStateRequest(market: Address): RequestLike {
  return { address: market, abi: orderBookAbi, functionName: "marketState" };
}

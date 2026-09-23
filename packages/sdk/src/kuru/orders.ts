import type { Address } from "viem";
import {
  buildBatchRequest,
  buildBurnPassiveLiquidityRequest,
  buildCancelAllOrdersRequest,
  buildCancelBySlotsRequest,
  buildMintPassiveLiquidityRequest,
  buildReplaceBySlotPackedRequest,
  buildSwapRequest,
  encodePackedReplaceOps,
  type BatchParams,
  type BurnPassiveLiquidityParams,
  type MintPassiveLiquidityParams,
  type PackedReplaceOpInput,
  type ReplaceBySlotPackedParams,
  type SwapParams,
} from "@toxicflow-labs/ts-sdk/spot";
import type { RequestLike } from "./encode.js";

export {
  buildBatchRequest,
  buildBurnPassiveLiquidityRequest,
  buildCancelAllOrdersRequest,
  buildMintPassiveLiquidityRequest,
  buildReplaceBySlotPackedRequest,
  buildSwapRequest,
  encodePackedReplaceOps,
};

export type {
  BatchParams,
  BurnPassiveLiquidityParams,
  MintPassiveLiquidityParams,
  PackedReplaceOpInput,
  ReplaceBySlotPackedParams,
  SwapParams,
};

export function batchRequest(params: BatchParams): RequestLike {
  return buildBatchRequest(params);
}

export function cancelAllRequest(params: {
  market: Address;
  userId: bigint;
}): RequestLike {
  return buildCancelAllOrdersRequest(params);
}

export function swapRequest(params: SwapParams): RequestLike {
  return buildSwapRequest(params);
}

export function mintPassiveRequest(params: MintPassiveLiquidityParams): RequestLike {
  return buildMintPassiveLiquidityRequest(params);
}

export function burnPassiveRequest(params: BurnPassiveLiquidityParams): RequestLike {
  return buildBurnPassiveLiquidityRequest(params);
}

export function replaceBySlotRequest(
  params: Omit<ReplaceBySlotPackedParams, "packedOps"> & {
    ops: readonly PackedReplaceOpInput[];
  },
): RequestLike {
  const { ops, ...rest } = params;
  return buildReplaceBySlotPackedRequest({
    ...rest,
    packedOps: encodePackedReplaceOps(ops),
  });
}

export function assertTradable(bound: boolean): void {
  if (!bound) {
    throw new Error("market is not bound; refusing to trade");
  }
}

export function passiveSeedRequest(
  bound: boolean,
  params: MintPassiveLiquidityParams,
): RequestLike {
  assertTradable(bound);
  return mintPassiveRequest(params);
}

export { buildCancelBySlotsRequest };

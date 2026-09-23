import type { Address, Hex } from "viem";
import { buildCancelBySlotsRequest } from "@toxicflow-labs/ts-sdk/spot";
import { batchRequest, type BatchParams } from "./orders.js";
import type { RequestLike } from "./encode.js";

/** Kuru Spot V2 accounts have 62 order slots on each market. */
export const SLOT_COUNT = 62;

export function freeSlotCount(liveOrderIds: readonly bigint[]): number {
  assertSlotBook(liveOrderIds);
  return liveOrderIds.filter((id) => id === 0n).length;
}

/** First free slot. Throws when every slot is occupied or the book length is wrong. */
export function allocateSlot(liveOrderIds: readonly bigint[]): number {
  assertSlotBook(liveOrderIds);
  const slot = liveOrderIds.findIndex((id) => id === 0n);
  if (slot < 0) {
    throw new Error("no free slot");
  }
  return slot;
}

export function placeBatch(
  liveOrderIds: readonly bigint[],
  params: BatchParams,
): { slot: number; request: RequestLike } {
  const free = freeSlotCount(liveOrderIds);
  if (params.orders.length === 0 || params.orders.length > free) {
    throw new Error("no free slot");
  }
  return { slot: allocateSlot(liveOrderIds), request: batchRequest(params) };
}

/**
 * Cancel one slot. The calldata is cancel-by-slot. `liveOrderId` must be the
 * current `getOrderId` and must match the id the caller last observed.
 */
export function cancelSlot(params: {
  market: Address;
  userId: bigint;
  slotIdx: number;
  liveOrderId: bigint;
  expectedOrderId: bigint;
  clientOrderId?: Hex;
}): RequestLike {
  if (params.slotIdx < 0 || params.slotIdx >= SLOT_COUNT) {
    throw new Error("slot out of range");
  }
  if (params.liveOrderId === 0n) {
    throw new Error("slot empty");
  }
  if (params.liveOrderId !== params.expectedOrderId) {
    throw new Error("stale order id");
  }
  return buildCancelBySlotsRequest({
    market: params.market,
    userId: params.userId,
    cancelSlotIdxs: [params.slotIdx],
    clientOrderId: params.clientOrderId,
  });
}

function assertSlotBook(liveOrderIds: readonly bigint[]): void {
  if (liveOrderIds.length !== SLOT_COUNT) {
    throw new Error(`expected ${SLOT_COUNT} slots`);
  }
}

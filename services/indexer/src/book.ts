import { decodeBookUpdatesPacked, type PackedBookUpdate } from "@toxicflow-labs/ts-sdk/events";
import type { Hex } from "viem";

export type Level = {
  isBuy: boolean;
  price: bigint;
  size: bigint;
  live: boolean;
};

export type Book = Map<string, Level>;

export type Quote = {
  bid: bigint | null;
  ask: bigint | null;
  mid: bigint | null;
  depthBid: bigint;
  depthAsk: bigint;
};

export function emptyBook(): Book {
  return new Map();
}

export function bookToJson(book: Book): string {
  const rows = [...book.entries()].map(([orderId, level]) => ({
    orderId,
    isBuy: level.isBuy,
    price: level.price.toString(),
    size: level.size.toString(),
    live: level.live,
  }));
  return JSON.stringify(rows);
}

export function bookFromJson(raw: string): Book {
  const book = emptyBook();
  if (raw === "") return book;
  const rows = JSON.parse(raw) as {
    orderId: string;
    isBuy: boolean;
    price: string;
    size: string;
    live: boolean;
  }[];
  for (const row of rows) {
    book.set(row.orderId, {
      isBuy: row.isBuy,
      price: BigInt(row.price),
      size: BigInt(row.size),
      live: row.live,
    });
  }
  return book;
}

export function applyPackedBook(book: Book, packedUpdates: string): PackedBookUpdate[] {
  const updates = decodeBookUpdatesPacked(packedUpdates as Hex);
  for (const update of updates) {
    book.set(update.orderId.toString(), {
      isBuy: update.makerIsBuy,
      price: update.price,
      size: update.size,
      live: update.isLive && update.size > 0n,
    });
  }
  return updates;
}

/** Touch size on each side. Mid is set only when both a bid and an ask are live. */
export function quoteBook(book: Book): Quote {
  let bid: bigint | null = null;
  let ask: bigint | null = null;
  for (const level of book.values()) {
    if (!level.live) continue;
    if (level.isBuy) {
      if (bid === null || level.price > bid) bid = level.price;
    } else if (ask === null || level.price < ask) {
      ask = level.price;
    }
  }
  let depthBid = 0n;
  let depthAsk = 0n;
  for (const level of book.values()) {
    if (!level.live) continue;
    if (level.isBuy && level.price === bid) depthBid += level.size;
    if (!level.isBuy && level.price === ask) depthAsk += level.size;
  }
  const mid = bid !== null && ask !== null ? (bid + ask) / 2n : null;
  return { bid, ask, mid, depthBid, depthAsk };
}

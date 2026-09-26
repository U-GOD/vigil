import { type Address, type Hex } from "viem";
import { SLOT_COUNT, accountPermissionAbi, orderBookAbi, policyAdapterAbi } from "@vigil/sdk";
import { bookPriceToWad, type ChainView } from "./plan.js";

export type Reader = {
  readContract: (args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }) => Promise<unknown>;
  multicall: (args: {
    contracts: readonly {
      address: Address;
      abi: readonly unknown[];
      functionName: string;
      args?: readonly unknown[];
    }[];
    allowFailure: false;
  }) => Promise<readonly unknown[]>;
};

const vaultAbi = [
  {
    type: "function",
    name: "markets",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      { name: "noteUp", type: "address" },
      { name: "noteDn", type: "address" },
      { name: "collateral", type: "address" },
      { name: "collateralHeld", type: "uint256" },
      { name: "cumulativeMinted", type: "uint256" },
      { name: "registered", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "mintFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
] as const;

const settlementAbi = [
  {
    type: "function",
    name: "stateOf",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

const listingAbi = [
  {
    type: "function",
    name: "isBound",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "requireBound",
    stateMutability: "view",
    inputs: [{ name: "marketId", type: "bytes32" }],
    outputs: [
      { name: "bookUp", type: "address" },
      { name: "bookDn", type: "address" },
    ],
  },
] as const;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const accountAbi = [
  {
    type: "function",
    name: "userRegistry",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "id", type: "uint40" }],
  },
] as const;

const bookAbi = [
  {
    type: "function",
    name: "bestBidAsk",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "bid", type: "uint32" },
      { name: "ask", type: "uint32" },
    ],
  },
] as const;

export async function readCoverChain(
  client: Reader,
  args: {
    marketId: Hex;
    account: Address;
    adapter: Address;
    vault: Address;
    settlement: Address;
    collateral: Address;
    accountCore: Address;
    listing: Address | null;
  },
): Promise<ChainView> {
  const listed = await client.readContract({
    address: args.adapter,
    abi: policyAdapterAbi,
    functionName: "listings",
    args: [args.marketId],
  });
  const allowed = listedAllowed(listed);
  const notes = await client.readContract({
    address: args.vault,
    abi: vaultAbi,
    functionName: "markets",
    args: [args.marketId],
  });
  const { noteUp, noteDn } = listedNotes(notes);
  const state = asBig(
    await client.readContract({
      address: args.settlement,
      abi: settlementAbi,
      functionName: "stateOf",
      args: [args.marketId],
    }),
  );
  const mintFeeBps = asBig(
    await client.readContract({
      address: args.vault,
      abi: vaultAbi,
      functionName: "mintFeeBps",
    }),
  );
  const collateralBalance = asBig(
    await client.readContract({
      address: args.collateral,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [args.account],
    }),
  );
  const collateralAllowanceAdapter = asBig(
    await client.readContract({
      address: args.collateral,
      abi: erc20Abi,
      functionName: "allowance",
      args: [args.account, args.adapter],
    }),
  );
  const collateralAllowanceCore = asBig(
    await client.readContract({
      address: args.collateral,
      abi: erc20Abi,
      functionName: "allowance",
      args: [args.account, args.accountCore],
    }),
  );
  const userId = asBig(
    await client.readContract({
      address: args.accountCore,
      abi: accountAbi,
      functionName: "userRegistry",
      args: [args.account],
    }),
  );

  let bound = false;
  let bookUp: Address | null = null;
  let bookDn: Address | null = null;
  if (args.listing) {
    bound = Boolean(
      await client.readContract({
        address: args.listing,
        abi: listingAbi,
        functionName: "isBound",
        args: [args.marketId],
      }),
    );
    if (bound) {
      const books = asAddressPair(
        await client.readContract({
          address: args.listing,
          abi: listingAbi,
          functionName: "requireBound",
          args: [args.marketId],
        }),
      );
      bookUp = books[0];
      bookDn = books[1];
    }
  }

  const ask = bookDn ? await readAsk(client, bookDn) : null;
  const noteUpAllowanceCore = noteUp
    ? asBig(
        await client.readContract({
          address: noteUp,
          abi: erc20Abi,
          functionName: "allowance",
          args: [args.account, args.accountCore],
        }),
      )
    : 0n;
  const noteDnAllowanceCore = noteDn
    ? asBig(
        await client.readContract({
          address: noteDn,
          abi: erc20Abi,
          functionName: "allowance",
          args: [args.account, args.accountCore],
        }),
      )
    : 0n;

  return {
    allowed,
    bound,
    halted: state === 2n,
    trading: state === 1n,
    finalized: state === 3n || state === 4n,
    bookUp,
    bookDn,
    noteUp,
    noteDn,
    ask,
    collateralAllowanceAdapter,
    collateralAllowanceCore,
    noteUpAllowanceCore,
    noteDnAllowanceCore,
    collateralBalance,
    mintFeeBps,
    userId,
    liveOrderIdsUp: bookUp ? await readSlots(client, bookUp, userId) : null,
    liveOrderIdsDn: bookDn ? await readSlots(client, bookDn, userId) : null,
  };
}

export async function readPermission(client: Reader, accountCore: Address, name: string): Promise<bigint> {
  return asBig(
    await client.readContract({
      address: accountCore,
      abi: accountPermissionAbi,
      functionName: name,
    }),
  );
}

export async function readSignerNonce(
  client: Reader,
  accountCore: Address,
  account: Address,
): Promise<bigint> {
  return asBig(
    await client.readContract({
      address: accountCore,
      abi: accountPermissionAbi,
      functionName: "accountSignerAuthorizationNonces",
      args: [account],
    }),
  );
}

async function readAsk(client: Reader, book: Address): Promise<bigint | null> {
  const top = await client.readContract({
    address: book,
    abi: bookAbi,
    functionName: "bestBidAsk",
  });
  const ask = asBigPair(top)[1];
  if (ask === 0n) return null;
  return bookPriceToWad(ask);
}

async function readSlots(client: Reader, book: Address, userId: bigint): Promise<bigint[]> {
  const rows = await client.multicall({
    allowFailure: false,
    contracts: Array.from({ length: SLOT_COUNT }, (_, slot) => ({
      address: book,
      abi: orderBookAbi,
      functionName: "getOrderId",
      args: [userId, slot],
    })),
  });
  return rows.map((row) => asBig(row));
}

function listedAllowed(value: unknown): boolean {
  if (Array.isArray(value)) return Boolean(value[0]);
  return Boolean((value as { allowed?: boolean }).allowed);
}

function listedNotes(value: unknown): { noteUp: Address | null; noteDn: Address | null } {
  const row = Array.isArray(value)
    ? value
    : [
        (value as { noteUp?: Address }).noteUp,
        (value as { noteDn?: Address }).noteDn,
      ];
  const noteUp = asAddress(row[0]);
  const noteDn = asAddress(row[1]);
  return { noteUp, noteDn };
}

function asAddressPair(value: unknown): [Address | null, Address | null] {
  if (Array.isArray(value)) return [asAddress(value[0]), asAddress(value[1])];
  const row = value as { bookUp?: unknown; bookDn?: unknown };
  return [asAddress(row.bookUp), asAddress(row.bookDn)];
}

function asBigPair(value: unknown): [bigint, bigint] {
  if (Array.isArray(value)) return [asBig(value[0]), asBig(value[1])];
  const row = value as { bid?: unknown; ask?: unknown };
  return [asBig(row.bid), asBig(row.ask)];
}

function asAddress(value: unknown): Address | null {
  if (typeof value !== "string" || !value.startsWith("0x") || value === "0x0000000000000000000000000000000000000000") {
    return null;
  }
  return value as Address;
}

function asBig(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error("expected an integer from the chain");
}

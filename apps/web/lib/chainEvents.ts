import type { LogEvent } from "@vigil/indexer";
import { loadDeployments } from "@vigil/sdk";
import { monadTestnet } from "@vigil/sdk/chain";
import { createPublicClient, http, parseAbi, type Address, type Hex } from "viem";
import index from "./chain-index.json";

// The public Monad RPC limits eth_getLogs to 100 blocks, so the read path cannot replay
// history. Sessions and markets come from the deploy receipts in chain-index.json
// (rebuilt by scripts/indexReceipts.mjs). Everything that moves after deploy is read from
// contract state and expressed as the events the indexer reducer already understands.

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const ZERO = "0x0000000000000000000000000000000000000000";
const TTL_MS = 15_000;

const sessionsAbi = parseAbi([
  "function sessionOf(uint64 sessionId) view returns ((bytes32 exchange, uint64 closeTs, uint64 openTs, uint64 fallbackDeadline, uint32 printBandSecs, bool active))",
  "function successorOf(uint64 sessionId) view returns (uint64)",
  "function noAuction(uint64 sessionId) view returns (bool)",
]);
const settlementAbi = parseAbi([
  "function stateOf(bytes32 marketId) view returns (uint8)",
  "function settlementOf(bytes32 marketId) view returns (uint256 sUp, uint8 state)",
]);
const vaultAbi = parseAbi([
  "function markets(bytes32 marketId) view returns (address noteUp, address noteDn, address collateral, uint256 collateralHeld, uint256 cumulativeMinted, bool registered)",
]);
const listingAbi = parseAbi([
  "struct BookSpec { uint32 pricePrecision; uint96 sizePrecision; uint32 tickSize; uint32 passiveSpreadTicks; uint96 minQuoteNotional; uint96 maxQuoteNotional; uint256 takerFeePps; uint256 makerFeePps; uint256 baseSizeMultiplier; }",
  "function listings(bytes32 marketId) view returns (address up, address dn, address collateral, BookSpec spec, bytes32 specHash, address bookUp, address bookDn, bool requested, bool bound)",
]);
const oracleAbi = parseAbi([
  "function statusOf(bytes32 ticker, uint64 sessionId, uint8 kind) view returns (uint256 candidate, uint8 count, uint64 disputeDeadline, bool disputed, bool finalized, bool voided)",
]);
const noteAbi = parseAbi(["function balanceOf(address account) view returns (uint256)"]);

const HALTED = 2;
const FINALIZED = 3;
const FALLBACK_FINALIZED = 4;

type Market = { marketId: Hex; ticker: Hex; sessionId: bigint; noteUp: Address; noteDn: Address };

const indexed = index as unknown as LogEvent[];
const markets: Market[] = indexed
  .filter((row) => row.contract === "ClosureMarketFactory" && row.event === "MarketCreated")
  .map((row) => ({
    marketId: row.args.marketId as Hex,
    ticker: row.args.ticker as Hex,
    sessionId: BigInt(row.args.sessionId!),
    noteUp: row.args.noteUp as Address,
    noteDn: row.args.noteDn as Address,
  }));
const sessionIds = [...new Set(markets.map((row) => row.sessionId))];
const storedSessions = new Set(
  indexed.filter((row) => row.event === "SessionStored").map((row) => BigInt(row.args.sessionId!)),
);
const printKeys = [...new Map(markets.map((row) => [`${row.ticker}:${row.sessionId}`, row])).values()];

const core = loadDeployments(monadTestnet.id).core;
const client = createPublicClient({ chain: monadTestnet, transport: http(monadTestnet.rpcUrls.default.http[0]) });

let cached: { at: number; events: LogEvent[] } | null = null;
let pending: Promise<LogEvent[]> | null = null;

export async function chainEvents(account?: Address): Promise<LogEvent[]> {
  const state = await stateEvents();
  if (!account) return state;
  return [...state, ...(await balanceEvents(account))];
}

async function stateEvents(): Promise<LogEvent[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.events;
  pending ??= readState()
    .then((events) => {
      cached = { at: Date.now(), events };
      return events;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

function event(
  contract: string,
  name: string,
  address: string,
  blockNumber: number,
  logIndex: number,
  args: Record<string, unknown>,
): LogEvent {
  const strings: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) strings[key] = String(value);
  return { contract, event: name, blockNumber, logIndex, address, args: strings };
}

async function readState(): Promise<LogEvent[]> {
  const sessions = core.sessions as Address;
  const settlement = core.settlement as Address;
  const vault = core.vault as Address;
  const listing = core.listing as Address;
  const oracle = core.oracle as Address;

  const sessionCalls = sessionIds.flatMap((id) => [
    { address: sessions, abi: sessionsAbi, functionName: "sessionOf", args: [id] } as const,
    { address: sessions, abi: sessionsAbi, functionName: "successorOf", args: [id] } as const,
    { address: sessions, abi: sessionsAbi, functionName: "noAuction", args: [id] } as const,
  ]);
  const marketCalls = markets.flatMap((row) => [
    { address: settlement, abi: settlementAbi, functionName: "stateOf", args: [row.marketId] } as const,
    { address: settlement, abi: settlementAbi, functionName: "settlementOf", args: [row.marketId] } as const,
    { address: vault, abi: vaultAbi, functionName: "markets", args: [row.marketId] } as const,
    { address: listing, abi: listingAbi, functionName: "listings", args: [row.marketId] } as const,
  ]);
  const printCalls = printKeys.flatMap((row) =>
    [0, 1].map(
      (kind) =>
        ({ address: oracle, abi: oracleAbi, functionName: "statusOf", args: [row.ticker, row.sessionId, kind] }) as const,
    ),
  );

  const [blockNumber, results] = await Promise.all([
    client.getBlockNumber(),
    client.multicall({
      contracts: [...sessionCalls, ...marketCalls, ...printCalls],
      allowFailure: true,
      multicallAddress: MULTICALL3,
      batchSize: 0,
    }),
  ]);
  const block = Number(blockNumber);
  const value = (i: number): unknown => (results[i]?.status === "success" ? results[i].result : undefined);

  const out: LogEvent[] = [...indexed];
  let log = 0;
  let i = 0;

  for (const id of sessionIds) {
    const session = value(i) as
      | { exchange: Hex; closeTs: bigint; openTs: bigint; fallbackDeadline: bigint; printBandSecs: number }
      | undefined;
    const successor = value(i + 1) as bigint | undefined;
    const noAuction = value(i + 2) as boolean | undefined;
    i += 3;
    if (session && !storedSessions.has(id)) {
      out.push(event("SessionRegistry", "SessionStored", sessions, 0, log++, { sessionId: id, ...session }));
    }
    if (successor) out.push(event("SessionRegistry", "SuccessorSet", sessions, block, log++, { sessionId: id, successorId: successor }));
    if (noAuction) out.push(event("SessionRegistry", "NoAuctionDeclared", sessions, block, log++, { sessionId: id }));
  }

  for (const row of markets) {
    const state = value(i) as number | undefined;
    const settled = value(i + 1) as readonly [bigint, number] | undefined;
    const held = value(i + 2) as readonly [Address, Address, Address, bigint, bigint, boolean] | undefined;
    const listed = value(i + 3) as readonly unknown[] | undefined;
    i += 4;
    if (held && held[3] > 0n) {
      out.push(
        event("ClosureVault", "Minted", vault, block, log++, {
          marketId: row.marketId,
          to: ZERO,
          pairs: held[3],
          paid: held[3],
          fee: 0,
        }),
      );
    }
    if (listed && listed[8] === true) {
      out.push(
        event("KuruListingAdapter", "ListingBound", listing, block, log++, {
          marketId: row.marketId,
          bookUp: listed[5],
          bookDn: listed[6],
        }),
      );
    }
    if (state === HALTED) {
      out.push(event("SettlementEngine", "Halted", settlement, block, log++, { marketId: row.marketId }));
    }
    if ((state === FINALIZED || state === FALLBACK_FINALIZED) && settled) {
      out.push(
        event("SettlementEngine", "Finalized", settlement, block, log++, {
          marketId: row.marketId,
          sUp: settled[0],
          fallbackSettle: state === FALLBACK_FINALIZED,
        }),
      );
    }
  }

  for (const row of printKeys) {
    for (const kind of [0, 1]) {
      const status = value(i++) as readonly [bigint, number, bigint, boolean, boolean, boolean] | undefined;
      if (!status || status[1] === 0) continue;
      const [candidate, , deadline, , finalized, voided] = status;
      const key = { ticker: row.ticker, sessionId: row.sessionId, kind };
      if (candidate > 0n) {
        out.push(event("PrintOracle", "QuorumReached", oracle, block, log++, { ...key, candidate, deadline }));
      }
      if (voided) {
        out.push(event("PrintOracle", "DisputeResolved", oracle, block, log++, { ...key, upheld: true }));
      } else if (finalized) {
        out.push(event("PrintOracle", "PrintFinalized", oracle, block, log++, { ...key, price: candidate }));
      }
    }
  }
  return out;
}

async function balanceEvents(account: Address): Promise<LogEvent[]> {
  const notes = markets.flatMap((row) => [row.noteUp, row.noteDn]);
  const [blockNumber, results] = await Promise.all([
    client.getBlockNumber(),
    client.multicall({
      contracts: notes.map((address) => ({ address, abi: noteAbi, functionName: "balanceOf", args: [account] }) as const),
      allowFailure: true,
      multicallAddress: MULTICALL3,
      batchSize: 0,
    }),
  ]);
  const block = Number(blockNumber);
  return notes.flatMap((note, n) => {
    const result = results[n];
    if (result?.status !== "success" || result.result === 0n) return [];
    return [event("ClosureNote", "Transfer", note, block, 1_000_000 + n, { from: ZERO, to: account, value: result.result })];
  });
}

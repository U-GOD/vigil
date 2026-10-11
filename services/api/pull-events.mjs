import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, decodeEventLog, http } from "viem";

const abi = [
  {
    type: "event",
    name: "SessionStored",
    inputs: [
      { name: "sessionId", type: "uint64", indexed: true },
      { name: "exchange", type: "bytes32" },
      { name: "closeTs", type: "uint64" },
      { name: "openTs", type: "uint64" },
      { name: "fallbackDeadline", type: "uint64" },
      { name: "printBandSecs", type: "uint32" },
    ],
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "ticker", type: "bytes32" },
      { name: "sessionId", type: "uint64" },
      { name: "kUp", type: "uint64" },
      { name: "kDn", type: "uint64" },
      { name: "collateral", type: "address" },
      { name: "noteUp", type: "address" },
      { name: "noteDn", type: "address" },
      { name: "creator", type: "address" },
    ],
  },
  {
    type: "event",
    name: "MarketRegistered",
    inputs: [
      { name: "marketId", type: "bytes32", indexed: true },
      { name: "ticker", type: "bytes32" },
      { name: "sessionId", type: "uint64" },
      { name: "kUp", type: "uint64" },
      { name: "kDn", type: "uint64" },
    ],
  },
];
const wanted = new Set(["SessionStored", "MarketCreated", "MarketRegistered"]);
const contractOf = {
  "0x79bbf36caffa9dfca5220df09c1fa66d0d830c09": "SessionRegistry",
  "0x24ccae43cd194ba893608f1a4d445749d25b435f": "ClosureMarketFactory",
  "0xef3167efdb42e97b7d5363e3578a4a54b1a450da": "SettlementEngine",
};

function pushLog(rows, contract, log) {
  let decoded;
  try {
    decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
  } catch {
    return;
  }
  if (!wanted.has(decoded.eventName)) return;
  const args = {};
  for (const [key, value] of Object.entries(decoded.args)) {
    args[key] = typeof value === "bigint" ? value.toString() : String(value);
  }
  const block = typeof log.blockNumber === "string" ? Number(log.blockNumber) : Number(log.blockNumber);
  rows.push({
    contract,
    event: decoded.eventName,
    blockNumber: block,
    logIndex: Number(log.logIndex ?? 0),
    address: log.address,
    args,
  });
}

const rows = [];
for (const file of [
  "contracts/broadcast/SeedSynth.s.sol/10143/run-latest.json",
  "contracts/broadcast/CreateMarkets.s.sol/10143/run-latest.json",
]) {
  const broadcast = JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));
  for (const receipt of broadcast.receipts ?? []) {
    if (receipt.status !== "0x1" && receipt.status !== "0x01") continue;
    for (const log of receipt.logs ?? []) {
      const contract = contractOf[String(log.address).toLowerCase()];
      if (contract) pushLog(rows, contract, log);
    }
  }
}

const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const windows = [
  ["0x79BBf36CaFFA9DFca5220dF09c1Fa66D0d830C09", "SessionRegistry", 66_842_000n, 66_844_500n],
  ["0x24CCaE43cD194Ba893608F1a4d445749D25b435f", "ClosureMarketFactory", 66_842_000n, 66_844_500n],
  ["0xEF3167EfDb42E97B7d5363E3578a4A54B1a450Da", "SettlementEngine", 66_842_000n, 66_844_500n],
  ["0x79BBf36CaFFA9DFca5220dF09c1Fa66D0d830C09", "SessionRegistry", 69_652_000n, 69_656_000n],
];
for (const [address, contract, from, to] of windows) {
  for (let cursor = from; cursor <= to; cursor += 100n) {
    const end = cursor + 99n > to ? to : cursor + 99n;
    const logs = await client.getLogs({ address, fromBlock: cursor, toBlock: end });
    for (const log of logs) pushLog(rows, contract, log);
  }
  process.stdout.write(`scanned ${contract} ${from}\n`);
}

const seen = new Set();
const unique = [];
for (const row of rows) {
  const key = `${row.blockNumber}:${row.logIndex}:${row.event}:${row.args.marketId ?? row.args.sessionId}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}
unique.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
writeFileSync(new URL("./chain-events.json", import.meta.url), JSON.stringify(unique));
const sessions = unique.filter((row) => row.event === "SessionStored").map((row) => row.args.sessionId);
const markets = unique.filter((row) => row.event === "MarketCreated").length;
process.stdout.write(`events ${unique.length} markets ${markets} sessions ${sessions.join(",")}\n`);

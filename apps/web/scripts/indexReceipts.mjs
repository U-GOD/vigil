// Rebuilds lib/chain-index.json from the Foundry broadcast receipts on chain 10143.
// The public Monad RPC limits eth_getLogs to 100 blocks, so the session and market list
// comes from the deploy transactions. Live state is read from the contracts per request.
import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { createPublicClient, decodeEventLog, http, parseAbi } from "viem";

const root = new URL("../../../", import.meta.url);
const deployments = JSON.parse(
  readFileSync(new URL("packages/sdk/src/deployments/10143.json", root), "utf8"),
);
const core = deployments.core;

const abis = {
  SessionRegistry: parseAbi([
    "event SessionStored(uint64 indexed sessionId, bytes32 exchange, uint64 closeTs, uint64 openTs, uint64 fallbackDeadline, uint32 printBandSecs)",
    "event NoAuctionDeclared(uint64 indexed sessionId)",
    "event SuccessorSet(uint64 indexed sessionId, uint64 successorId)",
  ]),
  ClosureMarketFactory: parseAbi([
    "event MarketCreated(bytes32 indexed marketId, bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn, address collateral, address noteUp, address noteDn, address creator)",
  ]),
  SettlementEngine: parseAbi([
    "event MarketRegistered(bytes32 indexed marketId, bytes32 ticker, uint64 sessionId, uint64 kUp, uint64 kDn)",
  ]),
};
const contractOf = {
  [core.sessions.toLowerCase()]: "SessionRegistry",
  [core.factory.toLowerCase()]: "ClosureMarketFactory",
  [core.settlement.toLowerCase()]: "SettlementEngine",
};

const broadcast = new URL("contracts/broadcast/", root);
const hashes = new Set();
for (const script of readdirSync(broadcast)) {
  const dir = new URL(`${script}/10143/`, broadcast);
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json") || file === "run-latest.json") continue;
    const run = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
    for (const tx of run.transactions ?? []) if (tx.hash) hashes.add(tx.hash.toLowerCase());
  }
}

const client = createPublicClient({ transport: http("https://testnet-rpc.monad.xyz") });
const rows = [];
let missing = 0;
for (const hash of hashes) {
  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash });
  } catch {
    missing += 1;
    continue;
  }
  if (receipt.status !== "success") continue;
  for (const log of receipt.logs) {
    const contract = contractOf[log.address.toLowerCase()];
    if (!contract) continue;
    let decoded;
    try {
      decoded = decodeEventLog({ abi: abis[contract], data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    const args = {};
    for (const [key, value] of Object.entries(decoded.args)) args[key] = String(value);
    rows.push({
      contract,
      event: decoded.eventName,
      blockNumber: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      address: log.address,
      args,
    });
  }
}
rows.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
writeFileSync(new URL("lib/chain-index.json", new URL("../", import.meta.url)), `${JSON.stringify(rows, null, 1)}\n`);
const count = (name) => rows.filter((row) => row.event === name).length;
process.stdout.write(
  `transactions ${hashes.size}, no receipt ${missing}, sessions ${count("SessionStored")}, markets ${count("MarketCreated")}\n`,
);

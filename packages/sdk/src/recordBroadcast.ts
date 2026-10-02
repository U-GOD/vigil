import { getAddress, isAddress, type Address } from "viem";
import type { NetworkDeployments } from "./deployments.js";

const REQUIRED = [
  ["SessionRegistry", "sessions"],
  ["CorporateActionRegistry", "corpActions"],
  ["PrintOracle", "oracle"],
  ["SettlementEngine", "settlement"],
  ["ClosureVault", "vault"],
  ["ClosureMarketFactory", "factory"],
  ["TestCollateral", "collateral"],
  ["KuruListingAdapter", "listing"],
  ["PolicyAdapter", "policy"],
  ["UnderwritingVault", "underwriting"],
  ["PythPrintReporter", "pythReporter"],
] as const;

type CoreKey = (typeof REQUIRED)[number][1];

export type BroadcastTransaction = {
  hash?: string | null;
  transactionType?: string;
  contractName?: string | null;
  contractAddress?: string | null;
};

export type BroadcastReceipt = {
  status?: string | null;
  contractAddress?: string | null;
  blockNumber?: string | number | null;
  transactionHash?: string | null;
};

export type BroadcastFile = {
  transactions?: BroadcastTransaction[];
  receipts?: BroadcastReceipt[];
};

export function applyBroadcast(
  current: NetworkDeployments,
  broadcast: BroadcastFile,
): NetworkDeployments {
  const receipts = broadcast.receipts ?? [];
  if (receipts.length === 0) throw new Error("no successful broadcast");
  const blocks: number[] = [];
  const created = new Map<string, Address>();
  const byHash = new Set<string>();
  for (const receipt of receipts) {
    if (!success(receipt.status)) throw new Error("broadcast receipt was not successful");
    const block = blockNumber(receipt.blockNumber);
    if (block === null) throw new Error("broadcast receipt has no block number");
    blocks.push(block);
    if (typeof receipt.transactionHash === "string" && /^0x[0-9a-fA-F]{64}$/.test(receipt.transactionHash)) {
      byHash.add(receipt.transactionHash.toLowerCase());
    }
    if (!receipt.contractAddress || receipt.contractAddress === "0x0000000000000000000000000000000000000000") {
      continue;
    }
    created.set(getAddress(receipt.contractAddress).toLowerCase(), getAddress(receipt.contractAddress));
  }
  const found = new Map<CoreKey, Address>();
  for (const tx of broadcast.transactions ?? []) {
    if (tx.transactionType !== "CREATE" && tx.transactionType !== "CREATE2") continue;
    const name = tx.contractName ?? "";
    const slot = REQUIRED.find((row) => row[0] === name);
    if (!slot || !tx.contractAddress) continue;
    const address = getAddress(tx.contractAddress);
    if (!isAddress(address) || address === "0x0000000000000000000000000000000000000000") {
      throw new Error(`${name} has no address`);
    }
    if (typeof tx.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(tx.hash)) {
      throw new Error(`${name} has no transaction hash`);
    }
    // CREATE2 through the deterministic deployer leaves receipt.contractAddress empty.
    // A successful receipt with the same hash is enough.
    if (!created.has(address.toLowerCase()) && !byHash.has(tx.hash.toLowerCase())) {
      throw new Error(`${name} has no successful receipt`);
    }
    found.set(slot[1], address);
  }
  const missing = REQUIRED.filter((row) => !found.has(row[1])).map((row) => row[0]);
  if (missing.length !== 0) throw new Error(`broadcast is missing ${missing.join(", ")}`);
  const startBlock = Math.min(...blocks);
  return {
    ...current,
    startBlock,
    core: {
      ...current.core,
      sessions: found.get("sessions") ?? null,
      corpActions: found.get("corpActions") ?? null,
      oracle: found.get("oracle") ?? null,
      settlement: found.get("settlement") ?? null,
      vault: found.get("vault") ?? null,
      factory: found.get("factory") ?? null,
      collateral: found.get("collateral") ?? null,
      listing: found.get("listing") ?? null,
      policy: found.get("policy") ?? null,
      underwriting: found.get("underwriting") ?? null,
      pythReporter: found.get("pythReporter") ?? null,
    },
  };
}

function success(status: string | null | undefined): boolean {
  return status === "0x1" || status === "0x01";
}

function blockNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = value.startsWith("0x") ? Number(value) : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
}

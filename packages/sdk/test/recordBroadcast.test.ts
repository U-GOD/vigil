import { getAddress } from "viem";
import { describe, expect, it } from "vitest";
import { loadDeployments } from "../src/deployments.js";
import { applyBroadcast, type BroadcastFile } from "../src/recordBroadcast.js";

const names = [
  "SessionRegistry",
  "CorporateActionRegistry",
  "PrintOracle",
  "SettlementEngine",
  "ClosureVault",
  "ClosureMarketFactory",
  "TestCollateral",
  "KuruListingAdapter",
  "PolicyAdapter",
  "UnderwritingVault",
  "PythPrintReporter",
];

function broadcast(): BroadcastFile {
  const transactions = names.map((contractName, index) => ({
    hash: `0x${(index + 1).toString(16).padStart(64, "0")}`,
    transactionType: "CREATE2",
    contractName,
    contractAddress: getAddress(`0x${(index + 1).toString(16).padStart(40, "0")}`),
  }));
  const receipts = transactions.map((tx, index) => ({
    status: "0x1",
    contractAddress: tx.contractAddress,
    blockNumber: 1_000 + index,
  }));
  return { transactions, receipts };
}

describe("applyBroadcast", () => {
  it("fills the address book only from a successful broadcast", () => {
    const next = applyBroadcast(loadDeployments(10143), broadcast());
    expect(next.core.sessions).toBe(getAddress(`0x${"1".padStart(40, "0")}`));
    expect(next.core.pythReporter).toBe(getAddress(`0x${"b".padStart(40, "0")}`));
    expect(next.startBlock).toBe(1_000);
    expect(loadDeployments(10143).core.sessions).toBeNull();
  });

  it("refuses a partial or failed broadcast", () => {
    const file = broadcast();
    file.transactions = file.transactions?.slice(1);
    expect(() => applyBroadcast(loadDeployments(10143), file)).toThrow(/missing SessionRegistry/);
    const failed = broadcast();
    failed.receipts = failed.receipts?.map((receipt) => ({ ...receipt, status: "0x0" }));
    expect(() => applyBroadcast(loadDeployments(10143), failed)).toThrow(/not successful/);
    expect(() => applyBroadcast(loadDeployments(10143), { transactions: [], receipts: [] })).toThrow(
      /no successful broadcast/,
    );
    const dry = broadcast();
    dry.transactions = dry.transactions?.map((tx) => ({ ...tx, hash: null }));
    expect(() => applyBroadcast(loadDeployments(10143), dry)).toThrow(/no transaction hash/);
  });
});

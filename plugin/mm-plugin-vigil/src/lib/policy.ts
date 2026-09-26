import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type RiskPolicy = {
  maxCostBps: number;
  minCapWad: bigint;
  allowedCapsWad: bigint[];
  minCoverageWad: bigint;
  perTickerNotional: bigint;
  aggregateNotional: bigint;
  minPremiumBps: number;
  earningsExcluded: string[];
};

export const POLICY_LAYER =
  "The local risk policy is a second layer on Agent Wallet policy, not a substitute.";

const WAD = 10n ** 18n;

export function defaultPolicy(): RiskPolicy {
  return {
    maxCostBps: 20,
    minCapWad: WAD / 20n,
    allowedCapsWad: [WAD / 10n, (WAD * 25n) / 100n],
    minCoverageWad: WAD,
    perTickerNotional: 100_000_000_000n,
    aggregateNotional: 500_000_000_000n,
    minPremiumBps: 0,
    earningsExcluded: [],
  };
}

export function policyPath(override?: string): string {
  if (override && override.length > 0) return override;
  const fromEnv = process.env.VIGIL_POLICY;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return path.join(os.homedir(), ".vigil", "policy.json");
}

export function loadPolicy(file: string): RiskPolicy {
  if (!existsSync(file)) return defaultPolicy();
  return parsePolicy(JSON.parse(readFileSync(file, "utf8")) as unknown);
}

export function savePolicy(file: string, policy: RiskPolicy): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${serializePolicy(policy)}\n`, "utf8");
}

export function parsePolicy(raw: unknown): RiskPolicy {
  if (raw === null || typeof raw !== "object") throw new Error("policy must be an object");
  const row = raw as Record<string, unknown>;
  return {
    maxCostBps: numberField(row, "maxCostBps"),
    minCapWad: bigintField(row, "minCapWad"),
    allowedCapsWad: bigintList(row, "allowedCapsWad"),
    minCoverageWad: bigintField(row, "minCoverageWad"),
    perTickerNotional: bigintField(row, "perTickerNotional"),
    aggregateNotional: bigintField(row, "aggregateNotional"),
    minPremiumBps: numberField(row, "minPremiumBps"),
    earningsExcluded: stringList(row, "earningsExcluded"),
  };
}

export function serializePolicy(policy: RiskPolicy): string {
  return JSON.stringify(
    {
      maxCostBps: policy.maxCostBps,
      minCapWad: policy.minCapWad.toString(),
      allowedCapsWad: policy.allowedCapsWad.map((k) => k.toString()),
      minCoverageWad: policy.minCoverageWad.toString(),
      perTickerNotional: policy.perTickerNotional.toString(),
      aggregateNotional: policy.aggregateNotional.toString(),
      minPremiumBps: policy.minPremiumBps,
      earningsExcluded: policy.earningsExcluded,
    },
    null,
    2,
  );
}

export type PolicyPatch = {
  maxCostBps?: string;
  minCapWad?: string;
  allowedCapsWad?: string;
  minCoverageWad?: string;
  perTickerNotional?: string;
  aggregateNotional?: string;
  minPremiumBps?: string;
  earningsExcluded?: string;
};

export function applyPatch(policy: RiskPolicy, patch: PolicyPatch): RiskPolicy {
  const next = { ...policy, allowedCapsWad: [...policy.allowedCapsWad] };
  if (patch.maxCostBps) next.maxCostBps = Number(patch.maxCostBps);
  if (patch.minCapWad) next.minCapWad = BigInt(patch.minCapWad);
  if (patch.allowedCapsWad) {
    next.allowedCapsWad = patch.allowedCapsWad.split(",").filter(Boolean).map((k) => BigInt(k.trim()));
  }
  if (patch.minCoverageWad) next.minCoverageWad = BigInt(patch.minCoverageWad);
  if (patch.perTickerNotional) next.perTickerNotional = BigInt(patch.perTickerNotional);
  if (patch.aggregateNotional) next.aggregateNotional = BigInt(patch.aggregateNotional);
  if (patch.minPremiumBps) next.minPremiumBps = Number(patch.minPremiumBps);
  if (patch.earningsExcluded !== undefined && patch.earningsExcluded.length > 0) {
    next.earningsExcluded = patch.earningsExcluded.split(",").map((t) => t.trim().toUpperCase());
  }
  return parsePolicy(JSON.parse(serializePolicy(next)) as unknown);
}

function numberField(row: Record<string, unknown>, key: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${key} must be a non-negative integer`);
  }
  return value;
}

function bigintField(row: Record<string, unknown>, key: string): bigint {
  const value = row[key];
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${key} must be a decimal string`);
  }
  return BigInt(value);
}

function bigintList(row: Record<string, unknown>, key: string): bigint[] {
  const value = row[key];
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${key} must be a list`);
  return value.map((item, index) => {
    if (typeof item !== "string" || !/^\d+$/.test(item)) {
      throw new Error(`${key}[${index}] must be a decimal string`);
    }
    return BigInt(item);
  });
}

function stringList(row: Record<string, unknown>, key: string): string[] {
  const value = row[key];
  if (!Array.isArray(value)) throw new Error(`${key} must be a list`);
  return value.map((item) => {
    if (typeof item !== "string") throw new Error(`${key} entries must be strings`);
    return item.toUpperCase();
  });
}

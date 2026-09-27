import { loadDeployments, type CoreAddresses } from "@vigil/sdk";
import type { NoteBalance } from "./types.js";

export const NOT_DEPLOYED = "Closure contracts are not deployed on chain 10143.";

export function contractsDeployed(core: CoreAddresses): boolean {
  return (
    core.sessions !== null &&
    core.factory !== null &&
    core.vault !== null &&
    core.settlement !== null &&
    core.oracle !== null &&
    core.listing !== null &&
    core.collateral !== null &&
    core.underwriting !== null
  );
}

export function liveReconcileReady(
  chainId = 10143,
): { ready: true } | { ready: false; reason: string } {
  if (!contractsDeployed(loadDeployments(chainId).core)) {
    return { ready: false, reason: NOT_DEPLOYED };
  }
  if (!process.env.MONAD_RPC_URL) {
    return { ready: false, reason: "MONAD_RPC_URL is not set." };
  }
  return { ready: true };
}

export function compareBalances(
  indexed: readonly NoteBalance[],
  onchain: readonly { account: string; note: string; balance: bigint }[],
): { ok: boolean; mismatches: string[] } {
  const chain = new Map<string, bigint>();
  for (const row of onchain) {
    chain.set(`${row.account.toLowerCase()}:${row.note.toLowerCase()}`, row.balance);
  }
  const mismatches: string[] = [];
  const seen = new Set<string>();
  for (const row of indexed) {
    const key = `${row.account.toLowerCase()}:${row.note.toLowerCase()}`;
    seen.add(key);
    const actual = chain.get(key);
    if (actual === undefined) {
      mismatches.push(`${key} missing onchain`);
      continue;
    }
    if (actual !== row.balance) mismatches.push(`${key} indexed ${row.balance} chain ${actual}`);
  }
  for (const [key, balance] of chain) {
    if (!seen.has(key) && balance !== 0n) mismatches.push(`${key} missing from the index`);
  }
  return { ok: mismatches.length === 0, mismatches };
}

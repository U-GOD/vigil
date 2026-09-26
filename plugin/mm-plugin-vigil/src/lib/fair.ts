import { liveFairValue } from "@vigil/riskmodel";
import { resolveCap } from "./plan.js";
import type { RiskPolicy } from "./policy.js";

export async function fairForCap(ticker: string, policy: RiskPolicy, requested: bigint | null) {
  const band = await liveFairValue(ticker);
  const k = resolveCap(policy, requested);
  if (k === null) return null;
  const row = band.caps.find((cap) => cap.k === k);
  if (!row) return null;
  return { fairDn: row.dn, fairUp: row.up };
}

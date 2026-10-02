import { sizeHedge, type LiveBand } from "@vigil/riskmodel";
import { loadDeployments, WAD } from "@vigil/sdk";
import { formatUnits, formatWad } from "./format.js";
import { closureSession } from "./session.js";

export function marketsReport(nowSec: number): string {
  const deployments = loadDeployments(10143);
  const session = closureSession(nowSec);
  const lines = [
    "chain 10143",
    deployments.core.vault
      ? `ClosureVault ${deployments.core.vault}`
      : "ClosureVault is not deployed",
    deployments.core.policy
      ? `PolicyAdapter ${deployments.core.policy}`
      : "PolicyAdapter is not deployed",
    deployments.core.listing
      ? `KuruListingAdapter ${deployments.core.listing}. No Closure Note book is registered`
      : "No Closure Note book is registered",
  ];
  if (session) {
    const haltIn = session.openTs - nowSec;
    lines.push(
      `XNYS session ${session.id} is inside the close-to-open window. Halt is the open at ${session.openTs} (${haltIn}s).`,
    );
  } else {
    lines.push("No XNYS session is inside its close-to-open window.");
  }
  lines.push("Depth and implied premium require a bound book. None is registered.");
  return lines.join("\n");
}

export function positionsReport(input: {
  inventory: bigint | null;
  notes: bigint | null;
  kUp: bigint;
  kDn: bigint;
  onchain: boolean;
}): string {
  if (!input.onchain && (input.inventory === null || input.notes === null)) {
    return "Inventory was not provided and Closure Note balances are not deployed, so coverage is not computed.";
  }
  if (input.inventory === null || input.notes === null) {
    return "Pass inventory and note balance. Coverage is not guessed.";
  }
  const full = sizeHedge(input.inventory, input.kUp, input.kDn, WAD);
  const coverage = full === 0n ? 0n : (input.notes * WAD) / full;
  const worst = (input.inventory * input.kDn) / WAD;
  return [
    `Notes ${input.notes}. Full hedge at this cap ${full}.`,
    `Coverage ${formatWad(coverage)} of inventory.`,
    `Worst case of the unhedged book at the down cap is ${formatUnits(worst, 6)} collateral.`,
  ].join("\n");
}

export function quoteReport(band: LiveBand): string {
  const lines = [
    `${band.ticker} model band. No Kuru CN book is registered, so this is not a venue quote.`,
    `Close ${formatWad(band.pClose.price)} source ${band.pClose.source}.`,
    `Anchor ${formatWad(band.anchor.price)} source ${band.anchor.source}.`,
  ];
  for (const cap of band.caps) {
    lines.push(
      `Cap ${formatWad(cap.k)} fair UP ${formatWad(cap.up)} fair DN ${formatWad(cap.dn)} band ${formatWad(cap.low)} to ${formatWad(cap.high)}.`,
    );
  }
  return lines.join("\n");
}

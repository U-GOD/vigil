import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { WAD } from "@vigil/sdk";
import { coverPlan } from "../../lib/gather.js";
import { fairForCap } from "../../lib/fair.js";
import { bool, text } from "../../lib/flags.js";
import { CHAIN_ID, parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { loadPolicy, policyPath } from "../../lib/policy.js";
import { runPlan } from "../../lib/run.js";
import type { Reader } from "../../lib/chain.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
  inventory: text("inventory", "Inventory value in 6-decimal collateral units", { required: true }),
  account: text("account", "Account that signs and receives notes", { required: true }),
  coverage: text("coverage", "Coverage in WAD. Omit for 1e18"),
  k: text("k", "Cap in WAD. Omit for the tightest cap the local policy allows"),
  fairDn: text("fair-dn", "DN fair value in WAD. Omit to read the live anchor"),
  fairUp: text("fair-up", "UP fair value in WAD"),
  policy: text("policy", "Local risk policy file"),
  once: bool("once", "Evaluate once. This command is already a single shot"),
} satisfies InputSchema;

export default class Cover extends PluginCommand {
  static description =
    "Size a closure hedge and submit it through the Agent Wallet. One shot.";
  static examples = [
    "<%= config.bin %> vigil cover NVDA --inventory 1000000000 --account 0x0000000000000000000000000000000000000001",
  ];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:cover";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const policy = loadPolicy(policyPath(flags.policy));
    const requested = parseOptionalInteger(flags.k);
    const fair = await resolveFair(flags.ticker, policy, requested, flags.fairDn, flags.fairUp);
    if (!fair) {
      const report = "No sourced fair value for that cap. No transaction was submitted.";
      io.emit(report);
      return { report };
    }
    const plan = await coverPlan({
      client: io.ctx.publicClient(CHAIN_ID) as Reader,
      ticker: flags.ticker,
      inventoryValue: parseInteger(flags.inventory, "inventory"),
      coverage: parseOptionalInteger(flags.coverage) ?? WAD,
      requestedK: requested,
      fairDn: fair.fairDn,
      fairUp: fair.fairUp,
      account: parseAccount(flags.account),
      nowSec: Math.floor(Date.now() / 1000),
      policy,
    });
    return runPlan(io, this.pluginCommandId, plan);
  }
}

async function resolveFair(
  ticker: string,
  policy: Parameters<typeof fairForCap>[1],
  requested: bigint | null,
  fairDn: string | undefined,
  fairUp: string | undefined,
): Promise<{ fairDn: bigint; fairUp: bigint } | null> {
  const dn = parseOptionalInteger(fairDn);
  const up = parseOptionalInteger(fairUp);
  if (dn !== null && up !== null) return { fairDn: dn, fairUp: up };
  return fairForCap(ticker, policy, requested);
}

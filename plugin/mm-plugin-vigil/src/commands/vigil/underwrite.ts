import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { loadDeployments, WAD } from "@vigil/sdk";
import { fairForCap } from "../../lib/fair.js";
import { text } from "../../lib/flags.js";
import { CHAIN_ID, parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { planUnderwrite, resolveCap, type UnderwriteLeg } from "../../lib/plan.js";
import { loadPolicy, policyPath } from "../../lib/policy.js";
import { runPlan } from "../../lib/run.js";
import { closureSession } from "../../lib/session.js";

const inputs = {
  basket: text("basket", "Ticker:inventory pairs, comma-separated", { required: true }),
  account: text("account", "Account that signs", { required: true }),
  coverage: text("coverage", "Coverage in WAD"),
  k: text("k", "Cap in WAD"),
  policy: text("policy", "Local risk policy file"),
} satisfies InputSchema;

export default class Underwrite extends PluginCommand {
  static description =
    "Sell closure protection across a basket, within per-ticker and aggregate budgets, skipping earnings.";
  static examples = [
    "<%= config.bin %> vigil underwrite --basket NVDA:1000000000 --account 0x0000000000000000000000000000000000000001",
  ];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:underwrite";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const policy = loadPolicy(policyPath(flags.policy));
    const requested = parseOptionalInteger(flags.k);
    const k = resolveCap(policy, requested);
    const now = Math.floor(Date.now() / 1000);
    const session = closureSession(now);
    const deployments = loadDeployments(CHAIN_ID);
    const legs: UnderwriteLeg[] = [];
    const notes: string[] = [];
    for (const part of flags.basket.split(",")) {
      const [tickerRaw, inventoryRaw] = part.split(":");
      const ticker = tickerRaw?.trim().toUpperCase() ?? "";
      if (!ticker || !inventoryRaw) continue;
      try {
        const fair = await fairForCap(ticker, policy, requested);
        if (!fair) {
          notes.push(`${ticker}: no sourced fair value.`);
          continue;
        }
        legs.push({
          ticker,
          inventoryValue: parseInteger(inventoryRaw.trim(), "inventory"),
          fairDn: fair.fairDn,
          earnings: policy.earningsExcluded.includes(ticker),
          marketId: null,
          bound: false,
          bookDn: null,
          noteDn: null,
          liveOrderIds: null,
        });
      } catch (error) {
        notes.push(`${ticker}: ${error instanceof Error ? error.message : "quote failed"}`);
      }
    }
    const plan = planUnderwrite({
      ticker: legs[0]?.ticker ?? "",
      sessionLive: session !== null,
      sessionId: session ? BigInt(session.id) : null,
      policy,
      adapter: deployments.core.policy,
      collateral: deployments.core.collateral,
      accountCore: deployments.kuru.accountCore,
      account: parseAccount(flags.account),
      chain: null,
      legs,
      k,
      coverage: parseOptionalInteger(flags.coverage) ?? WAD,
    });
    if (notes.length > 0) plan.report = `${notes.join("\n")}\n${plan.report}`;
    return runPlan(io, this.pluginCommandId, plan);
  }
}

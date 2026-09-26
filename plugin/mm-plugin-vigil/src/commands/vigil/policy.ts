import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { bool, text } from "../../lib/flags.js";
import { applyPatch, loadPolicy, POLICY_LAYER, policyPath, savePolicy, serializePolicy } from "../../lib/policy.js";

const inputs = {
  file: text("file", "Local risk policy path. Defaults to ~/.vigil/policy.json or VIGIL_POLICY"),
  write: bool("write", "Write the supplied fields to the policy file"),
  maxCostBps: text("max-cost-bps", "Maximum premium over fair value, in basis points"),
  minCapWad: text("min-cap-wad", "Tightest allowed cap, in WAD"),
  allowedCapsWad: text("allowed-caps-wad", "Comma-separated caps in WAD"),
  minCoverageWad: text("min-coverage-wad", "Minimum coverage in WAD"),
  perTickerNotional: text("per-ticker-notional", "Per-ticker notional in collateral units"),
  aggregateNotional: text("aggregate-notional", "Aggregate notional in collateral units"),
  minPremiumBps: text("min-premium-bps", "Minimum premium when selling, in basis points"),
  earningsExcluded: text("earnings-excluded", "Comma-separated tickers to skip"),
} satisfies InputSchema;

export default class Policy extends PluginCommand {
  static description =
    "Read or write the local risk policy. It does not replace Agent Wallet policy, signing, or MFA.";
  static examples = ["<%= config.bin %> vigil policy", "<%= config.bin %> vigil policy --write --max-cost-bps 20"];
  static requiresAuth = false;
  static requiresInit = false;
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:policy";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const file = policyPath(flags.file);
    let policy = loadPolicy(file);
    if (flags.write) {
      policy = applyPatch(policy, {
        maxCostBps: flags.maxCostBps,
        minCapWad: flags.minCapWad,
        allowedCapsWad: flags.allowedCapsWad,
        minCoverageWad: flags.minCoverageWad,
        perTickerNotional: flags.perTickerNotional,
        aggregateNotional: flags.aggregateNotional,
        minPremiumBps: flags.minPremiumBps,
        earningsExcluded: flags.earningsExcluded,
      });
      savePolicy(file, policy);
    }
    const report = `${POLICY_LAYER}\n${file}\n${serializePolicy(policy)}`;
    io.emit(report);
    return { report };
  }
}

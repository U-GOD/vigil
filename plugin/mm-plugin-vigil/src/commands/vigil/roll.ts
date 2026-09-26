import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { loadDeployments, WAD } from "@vigil/sdk";
import { bool, text } from "../../lib/flags.js";
import { parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { nextCap, planRoll } from "../../lib/plan.js";
import { loadPolicy, policyPath } from "../../lib/policy.js";
import { runPlan } from "../../lib/run.js";
import { closureSession } from "../../lib/session.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
  account: text("account", "Account that signs", { required: true }),
  inventory: text("inventory", "Inventory value in 6-decimal collateral units", { required: true }),
  gap: text("gap", "Absolute gap in WAD", { required: true }),
  currentK: text("current-k", "Current cap in WAD", { required: true }),
  pairs: text("pairs", "Pairs currently held", { required: true }),
  fairUp: text("fair-up", "UP fair value in WAD", { required: true }),
  coverage: text("coverage", "Coverage in WAD"),
  ifPinned: bool("if-pinned", "Roll only when the gap is outside the current cap"),
  policy: text("policy", "Local risk policy file"),
} satisfies InputSchema;

export default class Roll extends PluginCommand {
  static description =
    "If protection is pinned at its cap, roll into the next wider cap the local policy allows.";
  static examples = ["<%= config.bin %> vigil roll NVDA --if-pinned --gap 70000000000000000 --current-k 100000000000000000"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:roll";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const policy = loadPolicy(policyPath(flags.policy));
    const currentK = parseInteger(flags.currentK, "current-k");
    const session = closureSession(Math.floor(Date.now() / 1000));
    const deployments = loadDeployments(10143);
    const plan = planRoll({
      ticker: flags.ticker,
      sessionLive: session !== null,
      sessionId: session ? BigInt(session.id) : null,
      policy,
      adapter: deployments.core.policy,
      collateral: deployments.core.collateral,
      accountCore: deployments.kuru.accountCore,
      account: parseAccount(flags.account),
      chain: null,
      inventoryValue: parseInteger(flags.inventory, "inventory"),
      coverage: parseOptionalInteger(flags.coverage) ?? WAD,
      currentK,
      absGapWad: parseInteger(flags.gap, "gap"),
      pairsHeld: parseInteger(flags.pairs, "pairs"),
      currentMarketId: null,
      widerMarketId: null,
      widerK: nextCap(policy, currentK),
      widerBound: false,
      widerBookUp: null,
      widerNoteUp: null,
      widerLiveOrderIds: null,
      fairUp: parseInteger(flags.fairUp, "fair-up"),
    });
    return runPlan(io, this.pluginCommandId, plan);
  }
}

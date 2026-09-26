import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { loadDeployments } from "@vigil/sdk";
import { text } from "../../lib/flags.js";
import { parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { planSettle } from "../../lib/plan.js";
import { runPlan } from "../../lib/run.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
  account: text("account", "Account that receives collateral", { required: true }),
  up: text("up", "UP notes to redeem"),
  dn: text("dn", "DN notes to redeem"),
  inventory: text("inventory", "Inventory the hedge covered, in collateral units", { required: true }),
  premium: text("premium", "Premium paid, in collateral units"),
  pClose: text("p-close", "Official close in WAD", { required: true }),
  pOpen: text("p-open", "Official open in WAD", { required: true }),
  k: text("k", "Cap in WAD", { required: true }),
} satisfies InputSchema;

export default class Settle extends PluginCommand {
  static description =
    "Redeem finalized notes through PolicyAdapter and report hedge P&L against the unhedged book.";
  static examples = ["<%= config.bin %> vigil settle NVDA --account 0xABC --dn 200000000 --inventory 1000000000"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:settle";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const k = parseInteger(flags.k, "k");
    const deployments = loadDeployments(10143);
    const plan = planSettle({
      ticker: flags.ticker,
      finalized: false,
      adapter: deployments.core.policy,
      marketId: null,
      account: parseAccount(flags.account),
      noteUp: null,
      noteDn: null,
      upAmt: parseOptionalInteger(flags.up) ?? 0n,
      dnAmt: parseOptionalInteger(flags.dn) ?? 0n,
      upAllowance: 0n,
      dnAllowance: 0n,
      inventoryValue: parseInteger(flags.inventory, "inventory"),
      premiumPaid: parseOptionalInteger(flags.premium) ?? 0n,
      pClose: parseInteger(flags.pClose, "p-close"),
      pOpen: parseInteger(flags.pOpen, "p-open"),
      kUp: k,
      kDn: k,
    });
    return runPlan(io, this.pluginCommandId, plan);
  }
}

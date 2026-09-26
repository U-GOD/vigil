import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { mintPlan } from "../../lib/gather.js";
import { bool, text } from "../../lib/flags.js";
import { CHAIN_ID, parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { loadPolicy, policyPath } from "../../lib/policy.js";
import { runPlan } from "../../lib/run.js";
import type { Reader } from "../../lib/chain.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
  pairs: text("pairs", "Pair amount in 6-decimal note units", { required: true }),
  account: text("account", "Account that signs and receives notes", { required: true }),
  k: text("k", "Cap in WAD"),
  burn: bool("burn", "Burn a pair instead of minting"),
  policy: text("policy", "Local risk policy file"),
} satisfies InputSchema;

export default class Mint extends PluginCommand {
  static description = "Mint or burn a Closure Note pair through PolicyAdapter.";
  static examples = ["<%= config.bin %> vigil mint NVDA --pairs 1000000 --account 0xABC --burn"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:mint";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const plan = await mintPlan({
      client: io.ctx.publicClient(CHAIN_ID) as Reader,
      ticker: flags.ticker,
      pairs: parseInteger(flags.pairs, "pairs"),
      burn: flags.burn,
      requestedK: parseOptionalInteger(flags.k),
      account: parseAccount(flags.account),
      nowSec: Math.floor(Date.now() / 1000),
      policy: loadPolicy(policyPath(flags.policy)),
    });
    return runPlan(io, this.pluginCommandId, plan);
  }
}

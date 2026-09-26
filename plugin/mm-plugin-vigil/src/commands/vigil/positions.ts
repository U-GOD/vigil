import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { loadDeployments, WAD } from "@vigil/sdk";
import { text } from "../../lib/flags.js";
import { parseOptionalInteger } from "../../lib/parse.js";
import { positionsReport } from "../../lib/report.js";

const inputs = {
  inventory: text("inventory", "Inventory value in 6-decimal collateral units"),
  notes: text("notes", "DN note balance in 6-decimal units"),
  k: text("k", "Cap in WAD. Defaults to 10%"),
} satisfies InputSchema;

export default class Positions extends PluginCommand {
  static description =
    "Coverage of a spot inventory by Closure Notes, and the worst case at the cap.";
  static examples = ["<%= config.bin %> vigil positions --inventory 1000000000 --notes 200000000"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:positions";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const k = parseOptionalInteger(flags.k) ?? WAD / 10n;
    const report = positionsReport({
      inventory: parseOptionalInteger(flags.inventory),
      notes: parseOptionalInteger(flags.notes),
      kUp: k,
      kDn: k,
      onchain: loadDeployments(10143).core.vault !== null,
    });
    io.emit(report);
    return { report };
  }
}

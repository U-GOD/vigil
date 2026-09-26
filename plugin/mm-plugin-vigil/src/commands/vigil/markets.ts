import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { text } from "../../lib/flags.js";
import { marketsReport } from "../../lib/report.js";

const inputs = {
  at: text("at", "Unix seconds to evaluate the calendar. Omit for the current time"),
} satisfies InputSchema;

export default class Markets extends PluginCommand {
  static description =
    "List closure sessions, deployment status, and whether a Closure Note book is bound.";
  static examples = ["<%= config.bin %> vigil markets"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:markets";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const now = flags.at ? Number(flags.at) : Math.floor(Date.now() / 1000);
    const report = marketsReport(now);
    io.emit(report);
    return { report };
  }
}

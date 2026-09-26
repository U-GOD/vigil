import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { liveFairValue } from "@vigil/riskmodel";
import { text } from "../../lib/flags.js";
import { quoteReport } from "../../lib/report.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
} satisfies InputSchema;

export default class Quote extends PluginCommand {
  static description =
    "Fair value and no-arb band from sourced prices. Read-only. Not a venue quote until a book is bound.";
  static examples = ["<%= config.bin %> vigil quote NVDA"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:quote";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const { ticker } = await io.resolveInputs(inputs);
    try {
      const report = quoteReport(await liveFairValue(ticker));
      io.emit(report);
      return { report };
    } catch (error) {
      const report = error instanceof Error ? error.message : "quote failed";
      io.emit(report);
      io.emit("No price was invented.");
      return { report };
    }
  }
}

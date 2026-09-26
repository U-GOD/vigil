import {
  type CommandIO,
  type InputSchema,
  PluginCommand,
  schemaToArgs,
  schemaToFlags,
} from "@metamask/agent-wallet/plugin";
import { isAddress, type Hex } from "viem";
import { loadDeployments, WAD } from "@vigil/sdk";
import { readPermission, readSignerNonce, type Reader } from "../../lib/chain.js";
import { buildTradeDelegate, tradeDelegateCall } from "../../lib/delegate.js";
import { coverPlan } from "../../lib/gather.js";
import { fairForCap } from "../../lib/fair.js";
import { text } from "../../lib/flags.js";
import { CHAIN_ID, parseAccount, parseInteger, parseOptionalInteger } from "../../lib/parse.js";
import { assertTradePermission } from "../../lib/plan.js";
import { loadPolicy, policyPath } from "../../lib/policy.js";
import { runPlan } from "../../lib/run.js";
import { closureSession, parseInterval, sleep } from "../../lib/session.js";

const inputs = {
  ticker: text("ticker", "Equity ticker", { required: true, index: 0 }),
  inventory: text("inventory", "Inventory value in 6-decimal collateral units", { required: true }),
  account: text("account", "Account that signs", { required: true }),
  interval: text("interval", "Loop interval, such as 60s. Agent Wallet is not a daemon"),
  until: text("until", "Stop condition. session-end stops at the next open"),
  coverage: text("coverage", "Coverage in WAD"),
  k: text("k", "Cap in WAD"),
  policy: text("policy", "Local risk policy file"),
  delegate: text("delegate", "TRADE-only signer to authorize until the session open. Never WITHDRAW"),
} satisfies InputSchema;

export default class Watch extends PluginCommand {
  static description =
    "Foreground loop. Each action still goes through the Agent Wallet, including MFA.";
  static examples = ["<%= config.bin %> vigil watch NVDA --inventory 1000000000 --account 0xABC --interval 60s --until session-end"];
  static flags = schemaToFlags(inputs);
  static args = schemaToArgs(inputs);
  protected readonly pluginCommandId = "vigil:watch";

  async execute(io: CommandIO): Promise<{ report: string }> {
    const flags = await io.resolveInputs(inputs);
    const policy = loadPolicy(policyPath(flags.policy));
    const interval = parseInterval(flags.interval || "60s");
    const until = flags.until || "session-end";
    const account = parseAccount(flags.account);
    const requested = parseOptionalInteger(flags.k);
    if (flags.delegate) {
      const delegated = await authorizeDelegate(io, flags.delegate, account);
      if (delegated) io.emit(delegated);
    }
    let report = "";
    do {
      if (io.signal.aborted) break;
      const fair = await fairForCap(flags.ticker, policy, requested);
      if (!fair) {
        report = "No sourced fair value for that cap. No transaction was submitted.";
        io.emit(report);
        break;
      }
      const plan = await coverPlan({
        client: io.ctx.publicClient(CHAIN_ID) as Reader,
        ticker: flags.ticker,
        inventoryValue: parseInteger(flags.inventory, "inventory"),
        coverage: parseOptionalInteger(flags.coverage) ?? WAD,
        requestedK: requested,
        fairDn: fair.fairDn,
        fairUp: fair.fairUp,
        account,
        nowSec: Math.floor(Date.now() / 1000),
        policy,
      });
      const result = await runPlan(io, this.pluginCommandId, plan);
      report = result.report;
      if (until !== "session-end") break;
      if (!closureSession(Math.floor(Date.now() / 1000))) break;
      await sleep(interval, io.signal);
    } while (until === "session-end" && !io.signal.aborted);
    return { report };
  }
}

async function authorizeDelegate(
  io: CommandIO,
  signerRaw: string,
  account: `0x${string}`,
): Promise<string | null> {
  if (!isAddress(signerRaw)) return "Delegate must be an address. No signer was authorized.";
  const session = closureSession(Math.floor(Date.now() / 1000));
  if (!session) return "No live session. A TRADE delegate was not authorized.";
  const client = io.ctx.publicClient(CHAIN_ID) as Reader;
  const accountCore = loadDeployments(CHAIN_ID).kuru.accountCore;
  const trade = await readPermission(client, accountCore, "ACCOUNT_PERMISSION_TRADE");
  const withdraw = await readPermission(client, accountCore, "ACCOUNT_PERMISSION_WITHDRAW");
  const permissions = assertTradePermission(trade, withdraw);
  const nonce = await readSignerNonce(client, accountCore, account);
  const expiry = BigInt(session.openTs);
  const typed = buildTradeDelegate({
    accountCore,
    account,
    signer: signerRaw,
    permissions,
    expiry,
    nonce,
    deadline: expiry,
  });
  const executor = await io.ctx.walletExecutor(io, "vigil:watch", { emitStepNotices: true });
  io.emit("Sign TRADE-only authorization. WITHDRAW is not granted.");
  const signed = await executor({
    kind: "typed-data",
    chainId: CHAIN_ID,
    typedData: typed,
  });
  const call = tradeDelegateCall({
    accountCore,
    account,
    signer: signerRaw,
    permissions,
    expiry,
    nonce,
    deadline: expiry,
    signature: signed.signature as Hex,
  });
  io.emit("Submit authorizeAccountSignerBySig. The permission bit is the onchain TRADE value.");
  const sent = await executor(
    {
      kind: "transaction",
      chainId: CHAIN_ID,
      transaction: { to: call.to, data: call.data, value: 0n },
    },
    { waitForReceipt: true },
  );
  return sent.hash;
}

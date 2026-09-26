import type { CommandIO } from "@metamask/agent-wallet/plugin";
import { CHAIN_ID } from "./parse.js";
import type { Plan } from "./plan.js";
import { POLICY_LAYER } from "./policy.js";

export async function runPlan(
  io: CommandIO,
  commandId: string,
  plan: Plan,
): Promise<{ report: string }> {
  io.emit(plan.report);
  if (plan.steps.length === 0) {
    if (plan.refusal) {
      io.emit(plan.refusal);
      io.emit(`${POLICY_LAYER} No transaction was submitted.`);
    }
    return { report: plan.report };
  }
  const executor = await io.ctx.walletExecutor(io, commandId, { emitStepNotices: true });
  for (const step of plan.steps) {
    io.emit(step.rationale);
    const result = await executor(
      {
        kind: "transaction",
        chainId: CHAIN_ID,
        transaction: { to: step.to, data: step.data, value: 0n },
      },
      { waitForReceipt: true },
    );
    io.emit(result.hash);
  }
  return { report: plan.report };
}

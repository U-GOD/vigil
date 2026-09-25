export type LifeState = "trading" | "halted" | "finalized" | "fallback";

export type LifeAction = {
  marketId: string;
  action: "halt" | "finalize" | "fallback" | "skip";
  alert: boolean;
};

export function lifecycleAction(input: {
  marketId: string;
  state: LifeState;
  nowSec: number;
  openTs: number;
  fallbackDeadline: number;
  printsFinal: boolean;
}): LifeAction {
  if (input.state === "finalized" || input.state === "fallback") {
    return { marketId: input.marketId, action: "skip", alert: false };
  }
  const overdue = input.state === "halted" && input.nowSec >= input.fallbackDeadline && !input.printsFinal;
  if (input.state === "trading" && input.nowSec >= input.openTs && input.nowSec < input.fallbackDeadline) {
    return { marketId: input.marketId, action: "halt", alert: false };
  }
  if (input.state === "halted" && input.printsFinal && input.nowSec < input.fallbackDeadline) {
    return { marketId: input.marketId, action: "finalize", alert: false };
  }
  if (
    (input.state === "halted" || input.state === "trading") &&
    input.nowSec >= input.fallbackDeadline
  ) {
    return { marketId: input.marketId, action: "fallback", alert: overdue || input.state === "halted" };
  }
  return { marketId: input.marketId, action: "skip", alert: false };
}

export function lifecycleBatch(rows: Parameters<typeof lifecycleAction>[0][]): LifeAction[] {
  return rows.map(lifecycleAction);
}

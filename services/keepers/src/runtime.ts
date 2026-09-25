import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export type Counters = Record<string, number>;

export type KeeperState = {
  counters: Counters;
  sessionLoss: Record<string, string>;
  quotes: Record<string, string>;
};

export type LogRecord = {
  ts: string;
  keeper: string;
  event: string;
  dryRun: boolean;
  killed: boolean;
  [key: string]: unknown;
};

export function loadState(path: string): KeeperState {
  if (!existsSync(path)) {
    return { counters: {}, sessionLoss: {}, quotes: {} };
  }
  return JSON.parse(readFileSync(path, "utf8")) as KeeperState;
}

export function saveState(path: string, state: KeeperState): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}

export function bump(state: KeeperState, name: string): void {
  state.counters[name] = (state.counters[name] ?? 0) + 1;
}

export function logAction(record: LogRecord): void {
  console.log(JSON.stringify(record));
}

export function killed(flag: string | undefined, switchPath: string | undefined): boolean {
  if (flag === "1") return true;
  if (switchPath && existsSync(switchPath)) return true;
  return false;
}

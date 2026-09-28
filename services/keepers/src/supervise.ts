import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { killed } from "./runtime.js";

export const KEEPER_NAMES = ["reporter", "pyth", "spot", "anchor", "vault", "lifecycle"] as const;

export async function supervise(options: {
  names: readonly string[];
  intervalMs: number;
  maxConsecutiveFailures: number;
  killed: () => boolean;
  run: (name: string) => Promise<void>;
  alert: (message: string) => void;
  sleep: (ms: number) => Promise<void>;
}): Promise<"kill-switch" | "failures"> {
  let consecutive = 0;
  for (;;) {
    if (options.killed()) return "kill-switch";
    let failed = false;
    for (const name of options.names) {
      if (options.killed()) return "kill-switch";
      try {
        await options.run(name);
      } catch (error) {
        failed = true;
        const message = error instanceof Error ? error.message : "keeper failed";
        options.alert(`${name}: ${message}`);
      }
    }
    consecutive = failed ? consecutive + 1 : 0;
    if (consecutive >= options.maxConsecutiveFailures) return "failures";
    await options.sleep(options.intervalMs);
  }
}

export function spawnKeeper(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exited ${code ?? "null"}`));
    });
  });
}

export function alertToFile(path: string | undefined, message: string): void {
  if (!path) {
    process.stderr.write(`${message}\n`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify({ ts: new Date().toISOString(), message })}\n`);
}

export async function startSupervisor(): Promise<"kill-switch" | "failures"> {
  const intervalMs = Number(process.env.KEEPER_INTERVAL_MS ?? 60_000);
  const maxConsecutiveFailures = Number(process.env.KEEPER_MAX_FAILURES ?? 5);
  const cli = fileURLToPath(new URL("./cli.js", import.meta.url));
  return supervise({
    names: KEEPER_NAMES,
    intervalMs,
    maxConsecutiveFailures,
    killed: () => killed(process.env.KEEPER_KILL, process.env.KEEPER_KILL_FILE),
    run: (name) => spawnKeeper(process.execPath, [cli, name]),
    alert: (message) => alertToFile(process.env.KEEPER_ALERT_LOG, message),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}

import { buildSessions } from "@vigil/marketdata";

export function closureSession(nowSec: number) {
  const sessions = buildSessions([2026, 9, 1], [2027, 9, 23]);
  return sessions.find((session) => nowSec >= session.closeTs && nowSec < session.openTs) ?? null;
}

export function parseInterval(raw: string): number {
  const match = /^(\d+)(ms|s|m)$/.exec(raw);
  if (!match) throw new Error("interval must look like 60s, 5m, or 500ms");
  const count = Number(match[1]);
  if (!Number.isInteger(count) || count <= 0) throw new Error("interval must be positive");
  if (match[2] === "ms") return count;
  if (match[2] === "s") return count * 1000;
  return count * 60_000;
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

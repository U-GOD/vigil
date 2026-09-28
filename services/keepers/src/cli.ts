import { anchorDecision } from "./anchor.js";
import { startSupervisor } from "./supervise.js";
import { lifecycleAction } from "./lifecycle.js";
import { pythReportIntent, reporterIntent } from "./reporter.js";
import { bump, killed, loadState, logAction, saveState } from "./runtime.js";
import { spotIntent } from "./spot.js";
import { vaultQuote } from "./vaultKeeper.js";

const statePath = process.env.KEEPER_STATE ?? "services/keepers/state/keeper.json";
const dryRun = process.env.KEEPER_DRY_RUN !== "0";
const isKilled = killed(process.env.KEEPER_KILL, process.env.KEEPER_KILL_FILE);

export function runDry(keeper: string, event: string, detail: unknown): void {
  const state = loadState(statePath);
  bump(state, keeper);
  if (!isKilled) saveState(statePath, state);
  logAction({
    ts: new Date().toISOString(),
    keeper,
    event,
    dryRun,
    killed: isKilled,
    detail,
  });
  if (!dryRun && !isKilled) {
    throw new Error("broadcast is blocked until a keeper key and a bound market exist");
  }
}

export function demo(): void {
  const command = process.argv[2] ?? "reporter";
  if (command === "reporter") {
    runDry(
      "reporter",
      "submit",
      reporterIntent(
        "NVDA",
        { sessionId: 20260923, closeTs: 1_790_193_600, openTs: 1_790_256_600, printBandSecs: 1800 },
        "close",
        1_790_193_600,
        { price: 225n * 10n ** 18n, timestampMs: 1_790_193_600_000, source: "yahoo-chart" },
      ),
    );
    return;
  }
  if (command === "pyth") {
    runDry("reporter", "pyth", pythReportIntent("0x01"));
    return;
  }
  if (command === "spot") {
    runDry(
      "spot",
      "quote",
      spotIntent({
        verified: false,
        nowMs: 1,
        staleMs: 60_000,
        spreadBps: 20n,
        reference: { price: 225n * 10n ** 18n, timestampMs: 1, source: "coingecko-xstock" },
        lastReference: 0n,
        moveBps: 10n,
      }),
    );
    return;
  }
  if (command === "anchor") {
    const wad = 10n ** 18n;
    runDry(
      "anchor",
      "decide",
      anchorDecision({
        bound: false,
        spotMid: wad,
        reference: wad,
        divergenceBps: 50n,
        pClose: 100n * wad,
        adj: wad,
        kUp: wad / 10n,
        kDn: wad / 10n,
        bookUp: { bid: 0n, ask: 0n },
        bookDn: { bid: 0n, ask: 0n },
        inventory: 0n,
        inventoryLimit: 1n,
        sessionLoss: 0n,
        lossCap: 1n,
        takerFee: 0n,
      }),
    );
    return;
  }
  if (command === "vault") {
    runDry("vault", "quote", "refusing an unbound market");
    return;
  }
  if (command === "lifecycle") {
    runDry(
      "lifecycle",
      "halt",
      lifecycleAction({
        marketId: "0x0",
        state: "trading",
        nowSec: 200,
        openTs: 100,
        fallbackDeadline: 300,
        printsFinal: false,
      }),
    );
    return;
  }
  throw new Error(`unknown keeper ${command}`);
}

if (process.argv[1]?.endsWith("cli.js")) {
  if (process.argv[2] === "supervise") {
    await startSupervisor();
  } else {
    demo();
  }
}

export { vaultQuote };

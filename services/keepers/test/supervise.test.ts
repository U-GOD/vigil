import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { alertToFile, spawnKeeper, supervise } from "../src/supervise.js";

describe("supervise", () => {
  it("stops on the kill switch before starting a keeper", async () => {
    let ran = false;
    const reason = await supervise({
      names: ["reporter"],
      intervalMs: 0,
      maxConsecutiveFailures: 2,
      killed: () => true,
      run: async () => {
        ran = true;
      },
      alert: () => undefined,
      sleep: async () => undefined,
    });
    expect(reason).toBe("kill-switch");
    expect(ran).toBe(false);
  });

  it("restarts until consecutive failures reach the cap", async () => {
    const alerts: string[] = [];
    let attempts = 0;
    const reason = await supervise({
      names: ["reporter"],
      intervalMs: 0,
      maxConsecutiveFailures: 3,
      killed: () => false,
      run: async () => {
        attempts += 1;
        if (attempts === 2) return;
        throw new Error("refusing an unbound market");
      },
      alert: (message) => alerts.push(message),
      sleep: async () => undefined,
    });
    expect(reason).toBe("failures");
    expect(attempts).toBe(5);
    expect(alerts[0]).toMatch(/unbound market/);
  });

  it("writes an alert line and can spawn a process that exits", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "vigil-keeper-"));
    const file = path.join(dir, "alerts.log");
    alertToFile(file, "reporter: halted");
    expect(readFileSync(file, "utf8")).toMatch(/halted/);
    await spawnKeeper(process.execPath, ["-e", "process.exit(0)"]);
  });
});

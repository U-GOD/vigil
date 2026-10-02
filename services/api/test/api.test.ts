import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import type { LogEvent } from "@vigil/indexer";
import { WAD, loadDeployments, marketId, type NetworkDeployments } from "@vigil/sdk";
import { dispatch } from "../src/routes.js";
import { createApiServer } from "../src/server.js";

const deployments = loadDeployments(10143);

function undeployed(): NetworkDeployments {
  return {
    ...deployments,
    startBlock: null,
    core: {
      sessions: null,
      corpActions: null,
      oracle: null,
      settlement: null,
      vault: null,
      factory: null,
      collateral: null,
      listing: null,
      policy: null,
      underwriting: null,
      pythReporter: null,
    },
  };
}
const ticker = stringToHex("NVDA", { size: 32 });
const collateral = "0x3333333333333333333333333333333333333333";
const id = marketId(ticker, 20_260_923n, WAD / 10n, WAD / 10n, collateral);

function created(): LogEvent {
  return {
    contract: "ClosureMarketFactory",
    event: "MarketCreated",
    address: collateral,
    blockNumber: 1,
    logIndex: 1,
    args: {
      marketId: id,
      ticker,
      sessionId: "20260923",
      kUp: (WAD / 10n).toString(),
      kDn: (WAD / 10n).toString(),
      collateral,
      noteUp: "0x4444444444444444444444444444444444444444",
      noteDn: "0x5555555555555555555555555555555555555555",
      creator: "0x1111111111111111111111111111111111111111",
    },
  };
}

describe("api", () => {
  it("says the contracts are not deployed when the log is empty", () => {
    const result = dispatch("/markets", [], undeployed());
    expect(result.status).toBe(200);
    const body = result.body as {
      contractsDeployed: boolean;
      markets: unknown[];
      reason: string;
      policy: string | null;
      chainId: number;
    };
    expect(body.contractsDeployed).toBe(false);
    expect(body.markets).toEqual([]);
    expect(body.reason).toMatch(/not deployed/);
    expect(body.policy).toBeNull();
    expect(body.chainId).toBe(10143);
  });

  it("answers the read routes from an event log in under 200ms", () => {
    const events: LogEvent[] = [created()];
    events.push({
      contract: "PrintOracle",
      event: "PrintFinalized",
      address: collateral,
      blockNumber: 2,
      logIndex: 1,
      args: { ticker, sessionId: "20260923", kind: "0", price: "100" },
    });
    for (let i = 0; i < 1_000; i += 1) {
      events.push({
        contract: "ClosureNote",
        event: "Transfer",
        address: "0x4444444444444444444444444444444444444444",
        blockNumber: 3,
        logIndex: i,
        args: {
          from: "0x0000000000000000000000000000000000000000",
          to: "0x1111111111111111111111111111111111111111",
          value: "1",
        },
      });
    }
    const started = performance.now();
    const markets = dispatch("/markets", events, deployments);
    const fair = dispatch(`/fairvalue/${id}?anchor=110`, events, deployments);
    const surface = dispatch("/surface/NVDA", events, deployments);
    const gaps = dispatch("/history/gaps/NVDA", events, deployments);
    const positions = dispatch(
      "/positions/0x1111111111111111111111111111111111111111",
      events,
      deployments,
    );
    expect(performance.now() - started).toBeLessThan(200);
    expect(markets.status).toBe(200);
    const fairBody = fair.body as { fairValueUp: string | null; detail: string };
    expect(fairBody.fairValueUp).toBeTruthy();
    expect(fairBody.detail).toMatch(/1 WAD/);
    const surfaceBody = surface.body as { surface: unknown; detail: string };
    expect(surfaceBody.surface).toBeNull();
    expect(surfaceBody.detail).toMatch(/two-sided/);
    expect((gaps.body as { gaps: unknown[] }).gaps).toEqual([]);
    expect((positions.body as { positions: { up: string }[] }).positions[0]?.up).toBe("1000");
  });

  it("serves an empty log against the deployed address book", async () => {
    const server = createApiServer([]);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/sessions/20260923`);
    const body = (await response.json()) as {
      session: null;
      contractsDeployed: boolean;
      prints: unknown[];
      settlements: unknown[];
    };
    expect(response.status).toBe(200);
    expect(body.session).toBeNull();
    expect(body.contractsDeployed).toBe(true);
    expect(body.prints).toEqual([]);
    expect(body.settlements).toEqual([]);
    server.close();
  });
});

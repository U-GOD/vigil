import type { Address } from "viem";
import { loadDeployments } from "@vigil/sdk";
import { readCoverChain, type Reader } from "./chain.js";
import {
  closureMarketId,
  planCover,
  planMint,
  resolveCap,
  type Plan,
} from "./plan.js";
import type { RiskPolicy } from "./policy.js";
import { closureSession } from "./session.js";

export async function coverPlan(args: {
  client: Reader | null;
  ticker: string;
  inventoryValue: bigint;
  coverage: bigint;
  requestedK: bigint | null;
  fairDn: bigint;
  fairUp: bigint;
  account: Address;
  nowSec: number;
  policy: RiskPolicy;
}): Promise<Plan> {
  const deployments = loadDeployments(10143);
  const session = closureSession(args.nowSec);
  const k = resolveCap(args.policy, args.requestedK);
  const sessionId = session ? BigInt(session.id) : null;
  const core = deployments.core;
  let market: ReturnType<typeof closureMarketId> | null = null;
  let chain = null;
  if (
    sessionId !== null &&
    k !== null &&
    core.policy &&
    core.vault &&
    core.collateral &&
    core.settlement &&
    args.client
  ) {
    market = closureMarketId(args.ticker, sessionId, k, core.collateral);
    chain = await readCoverChain(args.client, {
      marketId: market,
      account: args.account,
      adapter: core.policy,
      vault: core.vault,
      settlement: core.settlement,
      collateral: core.collateral,
      accountCore: deployments.kuru.accountCore,
      listing: core.listing,
    });
  }
  return planCover({
    ticker: args.ticker,
    sessionLive: session !== null,
    sessionId,
    policy: args.policy,
    adapter: core.policy,
    collateral: core.collateral,
    accountCore: deployments.kuru.accountCore,
    account: args.account,
    chain,
    inventoryValue: args.inventoryValue,
    k,
    coverage: args.coverage,
    fairDn: args.fairDn,
    fairUp: args.fairUp,
    marketId: market,
  });
}

export async function mintPlan(args: {
  client: Reader | null;
  ticker: string;
  pairs: bigint;
  burn: boolean;
  requestedK: bigint | null;
  account: Address;
  nowSec: number;
  policy: RiskPolicy;
}): Promise<Plan> {
  const deployments = loadDeployments(10143);
  const session = closureSession(args.nowSec);
  const k = resolveCap(args.policy, args.requestedK);
  const sessionId = session ? BigInt(session.id) : null;
  const core = deployments.core;
  let market: ReturnType<typeof closureMarketId> | null = null;
  let chain = null;
  if (
    sessionId !== null &&
    k !== null &&
    core.policy &&
    core.vault &&
    core.collateral &&
    core.settlement &&
    args.client
  ) {
    market = closureMarketId(args.ticker, sessionId, k, core.collateral);
    chain = await readCoverChain(args.client, {
      marketId: market,
      account: args.account,
      adapter: core.policy,
      vault: core.vault,
      settlement: core.settlement,
      collateral: core.collateral,
      accountCore: deployments.kuru.accountCore,
      listing: core.listing,
    });
  }
  return planMint({
    ticker: args.ticker,
    sessionLive: session !== null,
    sessionId,
    policy: args.policy,
    adapter: core.policy,
    collateral: core.collateral,
    accountCore: deployments.kuru.accountCore,
    account: args.account,
    chain,
    pairs: args.pairs,
    burn: args.burn,
    marketId: market,
    k,
  });
}

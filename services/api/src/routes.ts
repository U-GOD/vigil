import { readFileSync } from "node:fs";
import { fairValueDn, fairValueUp } from "@vigil/riskmodel";
import {
  NOT_DEPLOYED,
  contractsDeployed,
  snapshot,
  tickerLabel,
  type LogEvent,
  type Snapshot,
} from "@vigil/indexer";
import { WAD, loadDeployments, type NetworkDeployments } from "@vigil/sdk";
import { getAddress, isAddress } from "viem";

export type ApiResult = { status: number; body: unknown };

const emptySnapshot = (): Snapshot => ({
  sessions: [],
  markets: [],
  positions: [],
  prints: [],
  settlements: [],
  gaps: [],
  surfaces: [],
});

export function loadEventLog(path = process.env.INDEXER_EVENTS): LogEvent[] {
  if (!path) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8")) as LogEvent[];
  if (!Array.isArray(parsed)) throw new Error("INDEXER_EVENTS must be a JSON array");
  return parsed;
}

export function prepare(events: readonly LogEvent[], deployments: NetworkDeployments): {
  snapshot: Snapshot;
  contractsDeployed: boolean;
  reason: string | null;
} {
  const deployed = contractsDeployed(deployments.core);
  if (!deployed && events.length === 0) {
    return { snapshot: emptySnapshot(), contractsDeployed: false, reason: NOT_DEPLOYED };
  }
  return {
    snapshot: snapshot(events),
    contractsDeployed: deployed,
    reason: deployed ? null : `${NOT_DEPLOYED} Rows below come from the local event log.`,
  };
}

export function dispatch(url: string, events: readonly LogEvent[], deployments: NetworkDeployments): ApiResult {
  const started = performance.now();
  const prepared = prepare(events, deployments);
  const parsed = new URL(url, "http://127.0.0.1");
  const parts = parsed.pathname.split("/").filter(Boolean);
  const body = route(parts, parsed, prepared);
  return {
    status: body.status,
    body: { ...asRecord(body.body), elapsedMs: Math.round(performance.now() - started) },
  };
}

function asRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === "object" ? (body as Record<string, unknown>) : { value: body };
}

function route(
  parts: string[],
  url: URL,
  prepared: { snapshot: Snapshot; contractsDeployed: boolean; reason: string | null },
): ApiResult {
  const base = {
    contractsDeployed: prepared.contractsDeployed,
    reason: prepared.reason,
  };
  if (parts.length === 1 && parts[0] === "markets") {
    return { status: 200, body: { ...base, markets: prepared.snapshot.markets } };
  }
  if (parts[0] === "sessions" && parts[1]) {
    const session = prepared.snapshot.sessions.find((row) => row.sessionId === parts[1]);
    const markets = prepared.snapshot.markets.filter((row) => row.sessionId === parts[1]);
    if (!session) {
      return { status: 200, body: { ...base, session: null, markets: [] } };
    }
    return { status: 200, body: { ...base, session, markets } };
  }
  if (parts[0] === "positions" && parts[1]) {
    if (!isAddress(parts[1])) return { status: 400, body: { ...base, error: "invalid address" } };
    const account = getAddress(parts[1]).toLowerCase();
    const positions = prepared.snapshot.positions.filter((row) => row.account === account);
    return { status: 200, body: { ...base, account, positions } };
  }
  if (parts[0] === "fairvalue" && parts[1]) {
    return { status: 200, body: { ...base, ...fairValue(prepared.snapshot, parts[1], url) } };
  }
  if (parts[0] === "surface" && parts[1]) {
    return { status: 200, body: { ...base, ...surface(prepared.snapshot, decodeURIComponent(parts[1])) } };
  }
  if (parts[0] === "history" && parts[1] === "gaps" && parts[2]) {
    const ticker = decodeURIComponent(parts[2]);
    const gaps = prepared.snapshot.gaps.filter(
      (row) => row.tickerLabel === ticker || row.ticker === ticker.toLowerCase(),
    );
    return { status: 200, body: { ...base, ticker, gaps } };
  }
  return { status: 404, body: { ...base, error: "not found" } };
}

function fairValue(data: Snapshot, marketId: string, url: URL): Record<string, unknown> {
  const market = data.markets.find((row) => row.marketId === marketId.toLowerCase());
  if (!market) {
    return { marketId, fairValueUp: null, fairValueDn: null, detail: "Market is not indexed." };
  }
  const close = data.prints.find(
    (row) =>
      row.ticker === market.ticker &&
      row.sessionId === market.sessionId &&
      row.kind === "close" &&
      row.finalized &&
      !row.voided &&
      row.price !== null,
  );
  if (!close?.price) {
    return {
      marketId: market.marketId,
      fairValueUp: null,
      fairValueDn: null,
      detail: "A close print is not indexed.",
    };
  }
  const anchor = url.searchParams.get("anchor");
  if (!anchor || !/^\d+$/.test(anchor)) {
    return {
      marketId: market.marketId,
      close: close.price,
      fairValueUp: null,
      fairValueDn: null,
      detail: "Pass an anchor price as ?anchor=. The index does not fetch one.",
    };
  }
  const premiumRaw = url.searchParams.get("premium") ?? "0";
  const premium = /^\d+$/.test(premiumRaw) ? premiumRaw : "0";
  const up = fairValueUp(
    BigInt(anchor),
    BigInt(close.price),
    WAD,
    BigInt(market.kUp),
    BigInt(market.kDn),
    BigInt(premium),
  );
  return {
    marketId: market.marketId,
    close: close.price,
    anchor,
    adjustment: WAD.toString(),
    convergencePremium: premium,
    fairValueUp: up.toString(),
    fairValueDn: fairValueDn(BigInt(anchor), BigInt(close.price), WAD, BigInt(market.kUp), BigInt(market.kDn)).toString(),
    detail: "Adjustment is 1 WAD. Corporate-action events are not in this index.",
  };
}

function surface(data: Snapshot, ticker: string): Record<string, unknown> {
  const key = ticker.startsWith("0x") ? ticker.toLowerCase() : ticker;
  const row = data.surfaces.find((item) => item.ticker === key || item.tickerLabel === ticker);
  if (!row) {
    return {
      ticker,
      surface: null,
      detail: "No markets are indexed for this ticker.",
    };
  }
  if (row.reason) {
    return { ticker: row.tickerLabel, surface: null, premium: row.premium, detail: row.reason };
  }
  return {
    ticker: row.tickerLabel,
    blockNumber: row.blockNumber,
    premium: row.premium,
    surface: { above: row.above, below: row.below, asymmetry: row.asymmetry },
    detail: null,
  };
}

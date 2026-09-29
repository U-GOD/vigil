import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { selectWeekends } from "../../packages/marketdata/dist/weekends.js";

const root = dirname(fileURLToPath(import.meta.url));
const dataDir = join(root, "data");
const universe = JSON.parse(readFileSync(join(root, "tickers.json"), "utf8"));
const headers = { "user-agent": "vigil-marketdata" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseChart(body) {
  const result = body.chart?.result?.[0];
  if (!result) throw new Error("yahoo chart missing");
  const times = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const bars = [];
  for (let i = 0; i < times.length; i += 1) {
    const timeSec = times[i];
    const open = quote.open?.[i];
    const close = quote.close?.[i];
    const adjClose = adj[i];
    if (!timeSec || open == null || close == null || adjClose == null) continue;
    bars.push({ timeSec, open, close, adjClose });
  }
  const splits = Object.values(result.events?.splits ?? {})
    .map((split) => split.date)
    .filter((date) => Number.isFinite(date));
  return { bars, splits };
}

async function chart(ticker) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=2y&events=split&includeAdjustedClose=true`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return parseChart(await response.json());
}

const rows = [];
const tickers = {};
for (const ticker of universe.tickers) {
  try {
    const parsed = await chart(ticker);
    const selected = selectWeekends(parsed.bars, parsed.splits, 52);
    tickers[ticker] = {
      bars: parsed.bars.length,
      weekends: selected.kept.length,
      droppedSplitWeekends: selected.droppedSplitWeekends,
      error: null,
    };
    for (const row of selected.kept) {
      rows.push({ ticker, source: "yahoo-chart", ...row });
    }
    console.log(`${ticker} ${selected.kept.length} weekends, dropped ${selected.droppedSplitWeekends}`);
  } catch (error) {
    tickers[ticker] = { bars: 0, weekends: 0, droppedSplitWeekends: 0, error: String(error?.message ?? error) };
    console.log(`${ticker} FAILED ${tickers[ticker].error}`);
  }
  await sleep(400);
}

if (rows.length === 0) {
  throw new Error("no weekend rows were fetched");
}

const weekends = {
  source: "yahoo-chart",
  note: "Yahoo daily chart bars, not official auction prints. The close is dividend-adjusted via adjclose. The next open is scaled by that bar's adjclose/close. A split timestamp inside the weekend drops the row. At most 52 Fridays per ticker. The sample is not padded.",
  fetchedAt: new Date().toISOString(),
  range: "2y",
  interval: "1d",
  rule: "Friday America/New_York close, next bar at least 2 calendar days later. gap = nextOpen / fridayClose - 1.",
  earnings: "not tagged. Yahoo chart events=earn returned no earnings history. quoteSummary returned 401.",
  macro: "not tagged. No FOMC or CPI calendar was fetched.",
  tickers,
  rows,
};

const now = Math.floor(Date.now() / 1000);
const from = now - 14 * 24 * 60 * 60;
const offhoursUrl = `https://api.coingecko.com/api/v3/coins/nvidia-xstock/market_chart/range?vs_currency=usd&from=${from}&to=${now}`;
let offhours;
try {
  const response = await fetch(offhoursUrl, { headers });
  const text = await response.text();
  if (!response.ok) {
    offhours = { ok: false, status: response.status, error: text.slice(0, 240), points: [] };
  } else {
    const body = JSON.parse(text);
    const prices = Array.isArray(body.prices) ? body.prices : [];
    offhours = {
      ok: prices.length > 0,
      status: response.status,
      error: prices.length > 0 ? null : "empty prices",
      count: prices.length,
      points: prices.slice(0, 5).map(([timestampMs, usd]) => ({ timestampMs, usd })),
    };
  }
} catch (error) {
  offhours = { ok: false, status: null, error: String(error?.message ?? error), points: [] };
}

const offhoursFile = {
  ticker: "NVDA",
  id: "nvidia-xstock",
  url: offhoursUrl,
  note: "CoinGecko market_chart is a spot series for the one verified xStock id. It is not an official auction and it is not a 52-weekend history. Jupiter price v3 is a spot quote and was not called. The other 29 names have no verified xStock id, so no off-hours series was requested for them.",
  ...offhours,
};

await mkdir(dataDir, { recursive: true });
await writeFile(join(dataDir, "weekends.json"), `${JSON.stringify(weekends, null, 2)}\n`);
await writeFile(join(dataDir, "offhours.json"), `${JSON.stringify(offhoursFile, null, 2)}\n`);
console.log(`wrote ${rows.length} rows`);

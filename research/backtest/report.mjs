import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WAD } from "../../packages/sdk/dist/index.js";
import { usdToWad } from "../../packages/marketdata/dist/index.js";
import { LADDER, gapFromPrints, gapStats, settleSample, spreadCompression } from "../../packages/riskmodel/dist/index.js";

const root = dirname(fileURLToPath(import.meta.url));
const repo = join(root, "..", "..");
const weekends = JSON.parse(readFileSync(join(root, "data", "weekends.json"), "utf8"));
const offhours = JSON.parse(readFileSync(join(root, "data", "offhours.json"), "utf8"));
const book = JSON.parse(readFileSync(join(repo, "packages", "sdk", "src", "deployments", "10143.json"), "utf8"));

if (!Array.isArray(weekends.rows) || weekends.rows.length === 0) {
  throw new Error("weekends.json has no rows");
}

function wadText(wad, digits = 2) {
  if (wad === null || wad === undefined) return "n/a";
  const abs = wad < 0n ? -wad : wad;
  const scale = 10n ** BigInt(digits);
  const scaled = (abs * 100n * scale) / WAD;
  if (scaled === 0n) return digits === 2 ? "0.00%" : `0.${"0".repeat(digits)}%`;
  const sign = wad < 0n ? "-" : "";
  const whole = scaled / scale;
  const frac = (scaled % scale).toString().padStart(digits, "0");
  return `${sign}${whole}.${frac}%`;
}

function bpsText(wad) {
  const sign = wad < 0n ? "-" : "";
  const abs = wad < 0n ? -wad : wad;
  return `${sign}${((abs * 10_000n) / WAD).toString()}`;
}

function rate(count, total) {
  return `${count} of ${total}`;
}

const pairs = weekends.rows.map((row) => ({
  ticker: row.ticker,
  sessionId: row.sessionId,
  pClose: usdToWad(row.close),
  pOpen: usdToWad(row.open),
}));
const gaps = pairs.map((pair) => gapFromPrints(pair.pClose, pair.pOpen));
const pooled = gapStats(gaps);
const byTicker = new Map();
for (let i = 0; i < pairs.length; i += 1) {
  const pair = pairs[i];
  const gap = gaps[i];
  const bucket = byTicker.get(pair.ticker) ?? [];
  bucket.push(gap);
  byTicker.set(pair.ticker, bucket);
}

const tickerRows = [...byTicker.entries()].map(([ticker, sample]) => {
  const stats = gapStats(sample);
  return { ticker, stats };
});
tickerRows.sort((a, b) => a.ticker.localeCompare(b.ticker));

const pricePairs = pairs.map((pair) => ({ pClose: pair.pClose, pOpen: pair.pOpen }));
const caps = LADDER.map((cap) => settleSample(pricePairs, cap));
const spreads = LADDER.map((cap) => ({ cap, model: spreadCompression(gaps, cap.kDn) }));

const short = tickerRows.filter((row) => row.stats.count < 52);
const dropped = Object.values(weekends.tickers).reduce((sum, row) => sum + (row.droppedSplitWeekends ?? 0), 0);
const failed = Object.entries(weekends.tickers)
  .filter(([, row]) => row.error)
  .map(([ticker, row]) => `${ticker}: ${row.error}`);

const headline = spreads.find((row) => row.cap.name === "10/10");
if (!headline?.model || pooled.p05 === null || pooled.p95 === null || pooled.mean === null) {
  throw new Error("pooled sample has no spread model");
}

function statsCells(stats) {
  return [String(stats.count), wadText(stats.mean), wadText(stats.p05), wadText(stats.p95), wadText(stats.min), wadText(stats.max)];
}

const tickerTable = [
  "| Ticker | Weekends | Mean | p05 | p95 | Min | Max |",
  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ...tickerRows.map((row) => `| ${row.ticker} | ${statsCells(row.stats).join(" | ")} |`),
].join("\n");

const capTable = [
  "| Cap | Pin up | Pin down | Mean DN minus no-move split (bps) | P&L selling DN at the sample mean (bps) | P&L selling DN at the sample 95th percentile (bps) |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...caps.map(
    (cap) =>
      `| ${cap.name} | ${rate(cap.pinUp, cap.count)} | ${rate(cap.pinDown, cap.count)} | ${bpsText(cap.premiumOverNeutral)} | ${bpsText(cap.actuarialUnderwriter)} | ${bpsText(cap.loadedUnderwriter)} |`,
  ),
].join("\n");

const spreadTable = [
  "| Downside cap | Mean adverse gap | Mean residual | Share of adverse gap remaining |",
  "| --- | ---: | ---: | ---: |",
  ...spreads.map((row) => {
    if (!row.model) return `| ${row.cap.name} | n/a | n/a | n/a |`;
    const residual = row.model.meanResidual === 0n ? "0" : wadText(row.model.meanResidual, 4);
    return `| ${row.cap.name} | ${wadText(row.model.meanAdverse, 4)} | ${residual} | ${wadText(row.model.remainingWad)} |`;
  }),
].join("\n");

const firstPoint = offhours.points?.[0];
const offhoursText = offhours.ok
  ? `CoinGecko returned ${offhours.count} spot points for nvidia-xstock over the requested 14 days. The earliest stored point is ${Number(firstPoint?.usd).toFixed(2)} USD at ${firstPoint ? new Date(firstPoint.timestampMs).toISOString() : "n/a"}. That series is a spot quote, not an auction print, and it does not cover 52 weekends. No other name has a verified xStock id.`
  : `CoinGecko market_chart for nvidia-xstock did not return a usable history (${offhours.status ?? "no status"}: ${offhours.error ?? "empty"}). No off-hours quote series is in this backtest. Jupiter was not called. The other 29 names have no verified xStock id.`;

const deployed = book.core?.factory != null;
const liveText = deployed
  ? "The address book has a factory. This report does not invent fills from it. Live counts belong to an indexed session, and none is attached here."
  : "No markets were created on chain 10143. There are no fills, no volume, no settlement latency, no mass-settlement gas, no oracle disagreement rate, and no vault P&L. The 4.45 MON figure in the deploy notes is a simulation estimate, not a gas receipt.";

const numbers = `## Dataset

The sample is ${pairs.length} Friday-to-next-open gaps across ${byTicker.size} tickers, fetched ${weekends.fetchedAt} from Yahoo's daily chart (\`yahoo-chart\`, range ${weekends.range}, interval ${weekends.interval}). These are chart bars, not official auction prints. Each row is a Friday close in America/New_York and the next bar when that bar is at least two calendar days later. At most 52 Fridays are kept per ticker. The sample is not padded.

${short.length === 0 ? "Every ticker in the file has 52 weekends." : `Fewer than 52 weekends: ${short.map((row) => `${row.ticker} (${row.stats.count})`).join(", ")}.`}
${failed.length === 0 ? "Every requested ticker returned a chart." : `Missing tickers: ${failed.join("; ")}.`}
Split-crossed weekends dropped before the 52-week cut: ${dropped}.

Earnings were not tagged. Yahoo chart \`events=earn\` returned no earnings history, and the quoteSummary earnings module returned 401. Macro events were not tagged. No FOMC or CPI calendar was fetched. Rows are not labeled earnings, no-earnings, or macro.

## Realized gaps

Pooled mean ${wadText(pooled.mean)}, 5th percentile ${wadText(pooled.p05)}, 95th percentile ${wadText(pooled.p95)}, min ${wadText(pooled.min)}, max ${wadText(pooled.max)}, standard deviation ${wadText(pooled.stdev)} (population divisor N). Percentiles are nearest rank.

${tickerTable}

The chart is \`research/backtest/out/gaps.svg\`, one percentage-point bins of the pooled gaps. Bins outside ±15% are counted in the caption.

## Counterfactual settlement

Each weekend is settled with \`splitUp\` and \`payoutDn\` at the six caps in the testnet ladder. A pin is a settlement of 0 or 1 WAD. Counts are out of ${pairs.length} weekends. Mean DN minus the no-move split is negative when the average weekend opened higher, so the downside note settled below \`neutralSplit\`. That figure is not a traded premium. Selling one DN note at the sample mean earns the actuarial column, which is the truncation residue of that mean. Selling it at the nearest-rank 95th percentile of DN settlement earns the last column. Both prices are models. No Closure Note traded at them.

${capTable}

## Spread model

The model assumes a market maker's off-hours half-spread, as a fraction of price, equals the mean adverse move of a long inventory, \`max(-gap, 0)\`. A full DN hedge at downside cap k leaves \`max(-gap - k, 0)\`. No Kuru spread was measured. There is no Closure Note book.

The mean adverse move in this sample is ${wadText(headline.model.meanAdverse, 4)}. The worst downside is ${wadText(pooled.min)}, so a 10% downside cap leaves none of that component. The 5% cap leaves ${wadText(spreads.find((row) => row.cap.name === "5/5")?.model?.remainingWad ?? null)} of it. Wider downside caps also leave none, because this window never reached them.

${spreadTable}

## Off-hours quotes

${offhoursText}

## Live session

${liveText}
`;

const readme = `# Closure-gap backtest

This page is the Friday-close to next-open sample and the counterfactual Closure Note settlement of that sample. Every figure is produced by \`research/backtest/report.mjs\` from \`research/backtest/data/weekends.json\`.

\`\`\`mermaid
flowchart LR
  yahoo[Yahoo daily chart] --> fetch[fetch.mjs]
  fetch --> weekends[weekends.json]
  weekends --> report[report.mjs]
  report --> summary[summary.json]
  report --> chart[gaps.svg]
  report --> pages[this page and the demand note]
\`\`\`

${numbers}
## Reproduce

\`\`\`
pnpm --filter @vigil/marketdata build
pnpm --filter @vigil/sdk build
pnpm --filter @vigil/riskmodel build
node research/backtest/fetch.mjs
node research/backtest/report.mjs
\`\`\`

\`fetch.mjs\` calls Yahoo and CoinGecko. \`report.mjs\` does not. The unit tests cover weekend selection and the settlement math on fixtures. They do not call Yahoo.
`;

const demand = `# Demand evidence

These figures are the closure-gap backtest. They are written by the same script as \`research/README.md\`. This file is not a second measurement.

${numbers}
`;

function stringify(value) {
  return JSON.stringify(
    value,
    (_, item) => (typeof item === "bigint" ? item.toString() : item),
    2,
  );
}

const summary = {
  source: weekends.source,
  fetchedAt: weekends.fetchedAt,
  rows: pairs.length,
  tickers: byTicker.size,
  droppedSplitWeekends: dropped,
  failed,
  short: short.map((row) => ({ ticker: row.ticker, count: row.stats.count })),
  pooled,
  perTicker: tickerRows.map((row) => ({ ticker: row.ticker, ...row.stats })),
  caps,
  spreads: spreads.map((row) => ({
    name: row.cap.name,
    kDn: row.cap.kDn,
    model: row.model,
  })),
  offhours: { ok: offhours.ok, status: offhours.status, count: offhours.count ?? 0 },
  live: { deployed, text: liveText },
};

const hundredths = (wad) => {
  const sign = wad < 0n ? -1n : 1n;
  const abs = wad < 0n ? -wad : wad;
  return Number(sign * ((abs * 10_000n) / WAD)) / 100;
};

const binMin = -15;
const binCount = 30;
const bins = new Array(binCount).fill(0);
let below = 0;
let above = 0;
for (const gap of gaps) {
  const pct = hundredths(gap);
  if (pct < binMin) below += 1;
  else if (pct >= binMin + binCount) above += 1;
  else bins[Math.floor(pct - binMin)] += 1;
}
const peak = Math.max(...bins, 1);
const width = 760;
const height = 420;
const left = 48;
const plotWidth = 680;
const base = 340;
const plotHeight = 260;
const barWidth = plotWidth / binCount;
const rects = bins
  .map((count, index) => {
    const h = (count / peak) * plotHeight;
    const x = left + index * barWidth;
    return `<rect x="${x.toFixed(2)}" y="${(base - h).toFixed(2)}" width="${(barWidth - 1).toFixed(2)}" height="${h.toFixed(2)}" fill="#1f4e79"/>`;
  })
  .join("");
const guides = [-15, -10, -5, 0, 5, 10, 15]
  .map((mark) => {
    const x = left + ((mark - binMin) / binCount) * plotWidth;
    return `<line x1="${x}" y1="70" x2="${x}" y2="${base}" stroke="#c5cdd6" stroke-dasharray="3 3"/><text x="${x}" y="362" text-anchor="middle" font-size="11" fill="#333">${mark}%</text>`;
  })
  .join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="48" y="32" font-family="Georgia, serif" font-size="18" fill="#111">Friday close to next-session open</text>
  <text x="48" y="54" font-family="Georgia, serif" font-size="12" fill="#444">${pairs.length} Yahoo chart bars. Not official auction prints. ${below} below -15%, ${above} at or above 15%.</text>
  ${guides}
  ${rects}
  <line x1="${left}" y1="${base}" x2="${left + plotWidth}" y2="${base}" stroke="#111"/>
</svg>
`;

await mkdir(join(root, "out"), { recursive: true });
await writeFile(join(root, "data", "summary.json"), `${stringify(summary)}\n`);
await writeFile(join(root, "out", "gaps.svg"), svg);
await writeFile(join(root, "..", "README.md"), readme);
await writeFile(join(root, "..", "kuru-bounty", "02-demand-evidence.md"), demand);
console.log(`rows ${pairs.length} tickers ${byTicker.size} mean ${wadText(pooled.mean)} p05 ${wadText(pooled.p05)} p95 ${wadText(pooled.p95)}`);
console.log(`10/10 remaining ${wadText(headline.model.remainingWad)}`);

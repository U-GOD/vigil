# Demand evidence

These figures are the closure-gap backtest. They are written by the same script as `research/README.md`. This file is not a second measurement.

## Dataset

The sample is 1560 Friday-to-next-open gaps across 30 tickers, fetched 2026-09-29T00:16:49.771Z from Yahoo's daily chart (`yahoo-chart`, range 2y, interval 1d). These are chart bars, not official auction prints. Each row is a Friday close in America/New_York and the next bar when that bar is at least two calendar days later. At most 52 Fridays are kept per ticker. The sample is not padded.

Every ticker in the file has 52 weekends.
Every requested ticker returned a chart.
Split-crossed weekends dropped before the 52-week cut: 1.

Earnings were not tagged. Yahoo chart `events=earn` returned no earnings history, and the quoteSummary earnings module returned 401. Macro events were not tagged. No FOMC or CPI calendar was fetched. Rows are not labeled earnings, no-earnings, or macro.

## Realized gaps

Pooled mean 0.13%, 5th percentile -1.61%, 95th percentile 2.21%, min -6.91%, max 37.51%, standard deviation 1.57% (population divisor N). Percentiles are nearest rank.

| Ticker | Weekends | Mean | p05 | p95 | Min | Max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| AAPL | 52 | 0.11% | -1.31% | 1.42% | -1.99% | 2.41% |
| ABBV | 52 | -0.07% | -1.12% | 1.11% | -1.80% | 1.76% |
| AMD | 52 | 1.05% | -3.17% | 4.29% | -5.78% | 37.51% |
| AMZN | 52 | 0.25% | -1.60% | 2.47% | -2.59% | 4.56% |
| AVGO | 52 | 0.45% | -2.16% | 3.51% | -3.41% | 8.66% |
| BAC | 52 | 0.03% | -1.22% | 1.13% | -2.10% | 2.50% |
| COST | 52 | 0.01% | -0.65% | 1.10% | -0.86% | 1.39% |
| CRM | 52 | 0.08% | -1.75% | 2.70% | -2.12% | 4.00% |
| CSCO | 52 | 0.12% | -1.31% | 1.57% | -1.92% | 2.52% |
| GOOG | 52 | 0.26% | -1.75% | 2.42% | -2.75% | 3.79% |
| HD | 52 | -0.01% | -1.22% | 1.92% | -2.08% | 3.50% |
| INTC | 52 | 0.56% | -3.51% | 5.61% | -6.91% | 11.92% |
| JNJ | 52 | -0.04% | -0.77% | 0.99% | -1.43% | 2.04% |
| JPM | 52 | 0.00% | -1.82% | 1.32% | -2.22% | 2.70% |
| KO | 52 | -0.02% | -0.78% | 1.01% | -1.23% | 1.93% |
| LLY | 52 | 0.14% | -1.03% | 2.37% | -2.10% | 3.71% |
| MA | 52 | -0.12% | -1.49% | 1.19% | -1.99% | 1.96% |
| META | 52 | 0.28% | -1.56% | 2.26% | -1.99% | 3.06% |
| MRK | 52 | -0.02% | -0.98% | 1.39% | -1.27% | 1.74% |
| MSFT | 52 | 0.13% | -1.33% | 2.19% | -1.87% | 3.24% |
| NFLX | 52 | 0.00% | -1.09% | 1.28% | -1.33% | 2.02% |
| NVDA | 52 | 0.27% | -2.20% | 2.64% | -3.22% | 3.69% |
| ORCL | 52 | 0.53% | -2.08% | 3.97% | -5.89% | 5.55% |
| PEP | 52 | -0.02% | -0.95% | 1.08% | -1.10% | 1.50% |
| PG | 52 | -0.13% | -0.81% | 0.80% | -1.42% | 1.29% |
| TSLA | 52 | 0.27% | -1.90% | 2.54% | -2.95% | 6.86% |
| UNH | 52 | -0.15% | -1.30% | 1.28% | -1.74% | 1.42% |
| V | 52 | -0.04% | -1.44% | 1.08% | -1.99% | 1.24% |
| WMT | 52 | 0.05% | -0.88% | 1.22% | -1.07% | 2.59% |
| XOM | 52 | 0.16% | -2.22% | 2.06% | -4.94% | 4.49% |

The chart is `research/backtest/out/gaps.svg`, one percentage-point bins of the pooled gaps. Bins outside ±15% are counted in the caption.

## Counterfactual settlement

Each weekend is settled with `splitUp` and `payoutDn` at the six caps in the testnet ladder. A pin is a settlement of 0 or 1 WAD. Counts are out of 1560 weekends. Mean DN minus the no-move split is negative when the average weekend opened higher, so the downside note settled below `neutralSplit`. That figure is not a traded premium. Selling one DN note at the sample mean earns the actuarial column, which is the truncation residue of that mean. Selling it at the nearest-rank 95th percentile of DN settlement earns the last column. Both prices are models. No Closure Note traded at them.

| Cap | Pin up | Pin down | Mean DN minus no-move split (bps) | P&L selling DN at the sample mean (bps) | P&L selling DN at the sample 95th percentile (bps) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 5/5 | 8 of 1560 | 3 of 1560 | -109 | 0 | 1717 |
| 10/10 | 2 of 1560 | 0 of 1560 | -59 | 0 | 863 |
| 15/15 | 1 of 1560 | 0 of 1560 | -41 | 0 | 577 |
| 25/25 | 1 of 1560 | 0 of 1560 | -26 | 0 | 347 |
| 10/25 | 2 of 1560 | 0 of 1560 | -34 | 0 | 493 |
| 25/10 | 1 of 1560 | 0 of 1560 | -37 | 0 | 496 |

## Spread model

The model assumes a market maker's off-hours half-spread, as a fraction of price, equals the mean adverse move of a long inventory, `max(-gap, 0)`. A full DN hedge at downside cap k leaves `max(-gap - k, 0)`. No Kuru spread was measured. There is no Closure Note book.

The mean adverse move in this sample is 0.3548%. The worst downside is -6.91%, so a 10% downside cap leaves none of that component. The 5% cap leaves 0.64% of it. Wider downside caps also leave none, because this window never reached them.

| Downside cap | Mean adverse gap | Mean residual | Share of adverse gap remaining |
| --- | ---: | ---: | ---: |
| 5/5 | 0.3548% | 0.0023% | 0.64% |
| 10/10 | 0.3548% | 0 | 0.00% |
| 15/15 | 0.3548% | 0 | 0.00% |
| 25/25 | 0.3548% | 0 | 0.00% |
| 10/25 | 0.3548% | 0 | 0.00% |
| 25/10 | 0.3548% | 0 | 0.00% |

## Off-hours quotes

CoinGecko returned 336 spot points for nvidia-xstock over the requested 14 days. The earliest stored point is 212.73 USD at 2026-09-15T01:00:00.000Z. That series is a spot quote, not an auction print, and it does not cover 52 weekends. No other name has a verified xStock id.

## Live session

No markets were created on chain 10143. There are no fills, no volume, no settlement latency, no mass-settlement gas, no oracle disagreement rate, and no vault P&L. The 4.45 MON figure in the deploy notes is a simulation estimate, not a gas receipt.


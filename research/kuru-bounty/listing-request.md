# Listing request — Closure Notes on Kuru Spot

To: Kuru listings / protocol
From: Vigil
Network: Monad testnet (chain 10143)
Date: 2026-09-21
Status: sent 2026-10-12 against the old SpotRouter; Kuru replied 2026-10-13. Revised below for the current testnet set.

## Ask

Enable a new spot asset class on Kuru Spot V2 and register OrderBooks for the first Closure Note pairs.

We do not have a permissionless `deployProxy`. That matches the current SpotRouter surface. We are asking Kuru to enable the tokens we deploy and to register the books.

## Asset

A Closure Note is a fully collateralized, capped claim on the official close-to-open return of a named equity over one exchange session.

- Anyone deposits USDC and receives 1 CN-UP + 1 CN-DN.
- The pair always redeems for exactly 1 USDC after the official opening print (or 0.5 / 0.5 if the oracle misses).
- Each `(ticker, session, kUp, kDn)` pair is its own ERC-20 pair. Notes from different weekends are not fungible.
- Quote asset: Kuru testnet USDC `0xb01DC575a7ef75e58A05D2bde73ab79f8e7dd0Be` (current set: SpotRouter `0x008200AD02fCb7020B019D11Cbabd32FecE1De78`, AccountCore `0xe08573a1Ecc4aa507c9626071fA0c4513caf7906`, WithdrawalLimiter `0x8cF002a44CeD91Ab93A5E4E6F893F1f7b5a9c0e5`).

This is not a prediction-market binary, not a perpetual, and not a wrapper of MON/USDC.

## Customer

Desks that quote tokenized equities and currently pull size when the underlying cash session closes. They need a place to transfer overnight and weekend gap risk. The other side is capital that wants that jump, priced.

## First listing set

Five names, two symmetric caps, one session to start. Ten base tokens, twenty books (UP and DN each).

| Ticker | Caps | Legs |
| --- | --- | --- |
| NVDA | 10%, 25% | CN-UP, CN-DN |
| AAPL | 10%, 25% | CN-UP, CN-DN |
| TSLA | 10%, 25% | CN-UP, CN-DN |
| MSFT | 10%, 25% | CN-UP, CN-DN |
| SPY | 10%, 25% | CN-UP, CN-DN |

Token addresses will follow once the factory is deployed. We will send the address list in one message.

## Requested book spec (identical on every CN market)

| Param | Value |
| --- | --- |
| Quote | USDC (6 decimals) |
| Base | CN leg (6 decimals) |
| `pricePrecision` | `1_000_000` |
| `sizePrecision` | `1_000_000` |
| `baseSizeMultiplier` | `1` |
| `tickSize` | `100` (1 bp) |
| `passiveSpreadTicks` | `50` |
| `minQuoteNotional` | `10_000_000` (10 USDC) |
| `maxQuoteNotional` | `5_000_000_000_000` |
| `takerFeePps` | `7000` |
| `makerFeePps` | `4000` |

Price lives in `[0, 1]`. At mid 0.5 the 10 USDC floor is 20 notes.

## What we need from Kuru

1. `AccountCore` `spotTokenEnabled` = true on each CN token (and USDC, already true).
2. A WithdrawalLimiter price source per CN token. Kuru's feeds are Kraken-backed `ManualPriceSource` contracts with a 300 s max age, and CN legs have no Kraken pair, so Vigil supplies one per note. Interface still to be confirmed with Kuru (`priceUsd18()` is what Kuru's sources expose).
3. An OrderBook proxy per pair, registered in SpotRouter and AccountCore.
4. Confirmation of the listing turnaround once we send addresses.
5. Optional: a seed of passive-band inventory, or an introduction to a testnet LP.

## What we ship

- Issuance and redemption (pair mint, pair burn, halt, oracle, redeem).
- An underwriting vault that quotes the protection leg from listing time.
- Anchor arbitrage against off-hours tokenized-equity prices.
- Agent execution that deposits to AccountCore and places native `batch` orders. No bypass of venue custody.

## Process

Reply with the accepted spec, any extra token metadata you need, and who receives the address list. We will not trade a book until `verifiedSpotMarket` and `verifiedSpotOrderBook` both read true for that address.

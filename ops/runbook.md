# Runbook

Fill a section when that phase first produces live evidence. Every command here must be re-runnable.

## Phase 0

See `ops/spikes.md` (local). Funded addresses and faucet results go here once 0.1 clears.

## Phase 1

### Toolchain

```
pnpm install
pnpm build
pnpm test
forge test --root contracts
```

### Deploy Ping (Monad testnet)

Requires `DEPLOYER_PRIVATE_KEY` and a funded deployer.

```
cd contracts
forge script script/DeployPing.s.sol:DeployPing --rpc-url monad_testnet --broadcast
```

Write the printed address into `packages/sdk/src/deployments/10143.json` as `ping`.

### Read Ping from the SDK

```
node --input-type=module -e "import { loadDeployments } from './packages/sdk/dist/index.js'; console.log(loadDeployments(10143))"
```

## Phase 2

Local:

```
pnpm --filter @vigil/sdk build
pnpm --filter @vigil/sdk gen:vectors
pnpm test
forge test --root contracts
FOUNDRY_PROFILE=intense forge test --root contracts --match-contract InvariantTest
```

Onchain (Monad testnet 10143). Requires a funded `DEPLOYER_PRIVATE_KEY`. Session window is compressed (`VIGIL_SYNTH`): close in two minutes, open one minute later. Prints are owner-injected. Collateral is `TestCollateral` (VUSD), a 6-decimal stand-in.

```
cd contracts
forge script script/DeployCore.s.sol:DeployCore --rpc-url monad_testnet --broadcast
```

Copy the printed addresses into the environment, then:

```
STEP=create   forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
STEP=mint     forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
STEP=burn     forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
# wait until session.openTs
STEP=halt     forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
STEP=inject   forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
STEP=finalize forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
STEP=redeem   forge script script/Lifecycle.s.sol:Lifecycle --rpc-url monad_testnet --broadcast
```

Required env after deploy: `FACTORY`, `VAULT`, `SETTLEMENT`, `ORACLE`, `COLLATERAL`, `MARKET_ID`.

Write the core addresses into `packages/sdk/src/deployments/10143.json` when the deploy lands. Record transaction hashes here.

**BLOCKED (2026-09-22):** deployer still has 0 MON. Phase-2 onchain exit is not met.

## Phase 3

Local:

```
pnpm --filter @vigil/sdk test
forge test --root contracts
```

`contracts/script/data/xnys-sessions.json` is the NYSE cash calendar from 2026-09-23 through 2027-09-23, including holidays and 13:00 early closes. The 2026-09-23 close timestamp matches the Pyth Equity.US schedule (`1790193600`). `contracts/script/data/pyth-equities.json` holds the Equity.US feed ids checked against Hermes on 2026-09-23. Do not point a feed at `Equity.Index.*`; those publish overnight and are not official prints.

Onchain (Monad testnet 10143). Requires a funded deployer, a council address, and three reporter addresses that are not the Pyth reporter contract.

```
cd contracts
forge script script/DeployOracle.s.sol:DeployOracle --rpc-url monad_testnet --broadcast
forge script script/SetFeeds.s.sol:SetFeeds --rpc-url monad_testnet --broadcast
forge script script/SeedSessions.s.sol:SeedSessions --rpc-url monad_testnet --broadcast
```

`DeployOracle` also creates compressed session `90000001` (`VIGIL_SYNTH`, dispute window 60 seconds). Real XNYS sessions use a 30 minute dispute window. Record the transaction hashes for: three reporter submissions, one Pyth `report`, one rejected outlier, one dispute whose bond is slashed, then `finalizePrint` and `SettlementEngine.finalize`.

**BLOCKED:** deployer still has 0 MON, and Hermes price updates return 401 without an API key. The onchain exit (three reporters, one of them Pyth, a rejected outlier, and a losing dispute) is not met.

## Phase 4

Local:

```
pnpm --filter @vigil/sdk test
forge test --root contracts --match-contract ListingAdapterTest
```

Set `MONAD_RPC_URL` for that run. `test_monUsdcBookIsVerified` then forks chain 10143 and checks the live MON/USDC book. Without the variable the test skips.

The listing adapter records a request and binds a book Kuru has already registered. It does not create markets. `requireBound` reverts until both books verify on SpotRouter and AccountCore and the spec matches with no delta. Passive spread is checked through `computeAddress`, because `getMarketParams` does not return it.

Onboarding, once the deployer holds MON:

```
node packages/sdk/scripts/kuruAccount.mjs
node packages/sdk/scripts/kuruAccount.mjs --broadcast
```

Dry-run prints the faucet `claim`, the USDC approve, and the AccountCore deposit. Broadcast also reads `ACCOUNT_PERMISSION_TRADE` and, when `TRADE_SIGNER` is set, authorizes that signer with only that permission. The same three calls are in `contracts/script/AccountDeposit.s.sol`.

After `FACTORY` and `VAULT` exist:

```
cd contracts
forge script script/DeployListing.s.sol:DeployListing --rpc-url monad_testnet --broadcast
```

Write the adapter into `LISTING_ADAPTER` and `packages/sdk/src/deployments/10143.json` (`core.listing`). Passive inventory is `contracts/script/SeedPassive.s.sol`. It calls `requireBound` and then `mintPassiveLiquidity` on the bound book. Set `LEG=dn` for the down book.

**Listing.** `research/kuru-bounty/listing-request.md` was drafted on 2026-09-21 and has not been sent. No Closure Note book is registered.

**Dated fallback (decided 2026-09-23).** If Kuru has not registered the CN books by 2026-10-07, note trading moves to a Vigil-operated RFQ/escrow labelled as a temporary venue. That escrow is not part of this phase. Until a bind succeeds, keepers and the plugin refuse the market. Encoder tests target the live MON/USDC book `0xfdbE356828c8f5A5d5ed4f69ddE0816f4058Ef61`. That book is not a Closure Note market.

**BLOCKED:** deployer still has 0 MON, so the faucet deposit, a listing bind, and a passive seed cannot be broadcast. The listing request has not been sent.

## Phase 5

```
pnpm --filter @vigil/marketdata test
pnpm --filter @vigil/riskmodel test
pnpm --filter @vigil/marketdata build
pnpm --filter @vigil/riskmodel build
node packages/riskmodel/dist/cli.js NVDA
```

The calendar in `@vigil/marketdata` is the same builder that writes `contracts/script/data/xnys-sessions.json`. Quote adapters return `{ price, timestampMs, source }`. CoinGecko and Jupiter are off-hours anchors and refuse to act as official prints. Yahoo supplies daily bars. Polygon supplies official open/close when `POLYGON_IO_API_KEY` is set. Hermes `getQuote` throws on HTTP 401.

`node packages/riskmodel/dist/cli.js NVDA` prints the 10% and 25% fair-value bands from the live anchor and the Yahoo regular close. If the two anchors differ by more than 50 bps it exits without a band. The output is a model for an unbound note, not a Kuru quote.

## Phase 6

```
pnpm --filter @vigil/keepers test
forge test --root contracts --match-contract UnderwritingVaultTest
```

Dry-run is the default. `KEEPER_DRY_RUN=0` still refuses to broadcast until a keeper key and a bound Closure Note book exist. `KEEPER_KILL=1` or a file at `KEEPER_KILL_FILE` is the kill switch. State is `KEEPER_STATE`.

`UnderwritingVault` is an ERC-4626 over the closure-vault collateral. The keeper mints pairs. Per-ticker exposure defaults to 2.5% of NAV. `worstCaseLoss` is allocation minus premium. The onchain exit (listed books, vault quotes, anchor fills, halt, finalize, redemption, hundreds of real fills) is not met: the deployer has 0 MON and Kuru has not registered a Closure Note book.

## Phase 7

Build the plugin, then install it into a signed-in Agent Wallet CLI. The browser extension is not that CLI.

```
pnpm --filter mm-plugin-vigil test
pnpm --filter mm-plugin-vigil build
mm doctor
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
```

Run the install from `plugin/mm-plugin-vigil` so the consent screen can read the manifest. Commands are `mm vigil markets`, `positions`, `quote`, `policy`, `cover`, `mint`, `underwrite`, `roll`, `settle`, and `watch`.

`mm vigil watch --interval 60s --until session-end` is a foreground loop. Cron or Task Scheduler should call `mm vigil cover --once` and `mm vigil roll --if-pinned`. MFA still applies to each submission.

The local policy file is a second layer on Agent Wallet policy, not a substitute. A TRADE delegate is opt-in on `mm vigil watch --delegate` and uses the permission bit read from AccountCore. It does not grant withdraw.

The onchain exit is not met. PolicyAdapter is tested in Foundry and has no 10143 address. The deployer still has 0 MON. No Closure Note book is registered. `mm vigil cover` refuses to submit until both exist. Do not record a hash that was not returned by the wallet.

## Phase 8

The indexer and the read API are local. A HyperIndex sync is not running.

`services/indexer` is an Envio project for chain 10143. Addresses and the start block come from the environment, filled from `packages/sdk/src/deployments/10143.json` after a deploy:

```
VIGIL_START_BLOCK
VIGIL_SESSIONS
VIGIL_FACTORY
VIGIL_LISTING
VIGIL_VAULT
VIGIL_SETTLEMENT
VIGIL_ORACLE
VIGIL_UNDERWRITING
```

Those values are empty today. Do not point the indexer at the zero address. Envio's documented HyperSync chain is Monad mainnet, chain 143. This config uses `https://testnet-rpc.monad.xyz` for chain 10143. `envio dev` needs Docker or Podman, and a hosted sync needs an Envio API key. Generate handlers with `pnpm dlx envio codegen` from `services/indexer` only after the addresses exist.

Until then the API reduces `INDEXER_EVENTS`, a JSON array of logs. An empty log is the default.

```
pnpm --filter @vigil/api start
```

`PORT` defaults to 8787. Routes are `/markets`, `/sessions/:id`, `/positions/:address`, `/fairvalue/:marketId?anchor=`, `/surface/:ticker`, and `/history/gaps/:ticker`. Fair value applies `@vigil/riskmodel` to the indexed close and the anchor you pass. Adjustment stays 1 WAD because corporate-action events are not indexed. The surface is empty until two caps on the same ticker have two-sided UP books.

Indexed note balances are checked against vault mint, burn, and redeem accounting in `services/indexer/test/reduce.test.ts`. A live `balanceOf` comparison refuses until `MONAD_RPC_URL` is set. That comparison is not evidence of an onchain reconciliation.

## Phase 9

`DeployProtocol` was broadcast on chain 10143. `packages/sdk/src/deployments/10143.json` records it from block 66840976. `SetFeeds` bound the six Equity.US session feeds. `SeedSynth` created session `90000001` (`VIGIL_SYNTH`, close delay 1800 seconds). The full `CreateMarkets` script, 30 markets in one transaction, simulated at about 12.7 MON when gas was 203 gwei, and was not broadcast. Thirteen markets were opened individually and allowed on `PolicyAdapter`: NVDA at 5/5, 10/10, 15/15, 25/25, 10/25, and 25/10; AAPL, TSLA, and MSFT at 5/5 and 10/10; AMZN at 5/5. The NYSE calendar was not seeded. Do not copy addresses out of `contracts/broadcast/**/dry-run`. Those files have no transaction hash.

The deterministic deployer `0x4e59b44847b379578588920cA78FbF26c0B4956C` is already on chain 10143. Salts live in `contracts/script/Salts.sol`. The owner of the stack is the broadcasting key.

Start, once that key holds MON:

```
forge script script/DeployProtocol.s.sol:DeployProtocol --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast --verify
pnpm --filter @vigil/sdk build
node packages/sdk/scripts/recordDeploy.mjs contracts/broadcast/DeployProtocol.s.sol/10143/run-latest.json
```

`recordDeploy` writes `packages/sdk/src/deployments/10143.json` only when every required create has a successful receipt and a transaction hash. Verification uses the Monadscan API key in `MONADSCAN_API_KEY`. `--verify` is the Sourcify/Etherscan path Foundry supports for this chain. If verification fails, rerun `forge verify-contract` with the constructor args from the broadcast file. Do not mark a contract verified without an explorer page.

Then, still as the owner:

```
forge script script/SetFeeds.s.sol:SetFeeds --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast
forge script script/SeedSessions.s.sol:SeedSessions --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast
forge script script/CreateMarkets.s.sol:CreateMarkets --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast
forge script script/FundUnderwriting.s.sol:FundUnderwriting --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

`SESSIONS`, `PYTH_REPORTER`, `FACTORY`, `POLICY`, `COLLATERAL`, `UNDERWRITING`, and `SESSION_ID` come from the recorded file. `FUND_AMOUNT` is testnet VUSD, minted by `TestCollateral`, not a production stablecoin. The first ladder is NVDA, AAPL, TSLA, MSFT, and AMZN, at 5/5, 10/10, 15/15, 25/25, 10/25, and 25/10. GOOG is in the feed file and is not in this batch. Only NVDA has a verified CoinGecko and Jupiter xStock id. The anchor keeper fails closed on the other names.

Adding a ticker means a checked Equity.US session feed in `contracts/script/data/pyth-equities.json`, then `SetFeeds`, then a new row in `TickerSet`. Do not invent an xStock id.

Adding a session is `SeedSessions` for the NYSE file, or one compressed window:

```
forge script script/SeedSynth.s.sol:SeedSynth --root contracts --rpc-url https://testnet-rpc.monad.xyz --broadcast
```

`SYNTH_SESSION_ID` stays in the 90_000_000 range so it does not collide with `yyyymmdd`. The default window is five minutes to the close, ten minutes to the open, and ten minutes of fallback. Run it on a 30-minute clock only after the stack is deployed. Nothing is looping that clock now.

Keepers:

```
pnpm --filter @vigil/keepers build
KEEPER_KILL=1 node services/keepers/dist/cli.js supervise
```

Clear `KEEPER_KILL` to let the loop run. It restarts `reporter`, `pyth`, `spot`, `anchor`, `vault`, and `lifecycle` every `KEEPER_INTERVAL_MS` (default 60 seconds). Five consecutive failed cycles stop the process. Alerts append to `KEEPER_ALERT_LOG`. Stop the process with `KEEPER_KILL=1` or a file at `KEEPER_KILL_FILE`. Dry-run is still the default. The CLI throws if dry-run is turned off, because no keeper key and no bound book exist. The supervisor does not submit those transactions.

A stuck print sits in the dispute window (`30 minutes` on XNYS, `60` seconds on `VIGIL_SYNTH`). The council can `resolveDispute`. After the window, anyone can `finalizePrint` and then `SettlementEngine.finalize`. Past `fallbackDeadline`, `fallbackFinalize` freezes the neutral split. The lifecycle keeper alerts when a halt is still open at that deadline. It does not send the transaction.

The next real weekend is session `20261002`: Friday 2 October 2026 close, Monday 5 October open. That window has not been run. Seven unattended days have not been run. Logs, when a supervisor is actually left up, are the JSON lines on stdout and `KEEPER_ALERT_LOG`.

Demo sequence, in order, and only after the broadcast and a bound book: `SeedSynth` or the live `20261002` session, `CreateMarkets`, `mm vigil quote`, `mm vigil cover`, halt, finalize, redeem. Until those transactions exist, the commands refuse.

## Phase 10

The backtest is a Yahoo daily chart sample, not an official auction print. Polygon's same-day open and close is not the weekend gap and is not used. Earnings history was not available: chart `events=earn` returned nothing, and quoteSummary returned 401. No FOMC or CPI calendar was fetched, so weekends are not split by regime.

Build the packages the scripts import, then fetch and report:

```
pnpm --filter @vigil/marketdata build
pnpm --filter @vigil/sdk build
pnpm --filter @vigil/riskmodel build
node research/backtest/fetch.mjs
node research/backtest/report.mjs
```

`fetch.mjs` writes `research/backtest/data/weekends.json` and `offhours.json`. It asks Yahoo for two years of daily bars on the names in `tickers.json`, keeps at most 52 Fridays per name, and drops a weekend when a split timestamp falls inside it. It also requests 14 days of CoinGecko history for `nvidia-xstock` only. `report.mjs` does not call the network. It writes `summary.json`, `out/gaps.svg`, `research/README.md`, and `research/kuru-bounty/02-demand-evidence.md` from the checked-in sample, using `splitUp` and `payoutDn`. Re-run the report after a fetch so the two pages cannot drift.

Live session statistics are absent. `DeployProtocol` has not been broadcast, so there are no markets, fills, volume, settlement latency, mass-settlement gas, oracle disagreements, or vault P&L. The 4.45 MON figure is a simulation estimate.

## Phase 11

The terminal is `apps/web`. It is five views on the Phase 8 API: session board, market, position, settlement, and surface. The market view is the indexed Kuru touch (bid, ask, mid, depth). It is not a TradingView chart. TradingView has no Closure Note symbol, and a chart of the underlying would be a different market.

```
pnpm --filter @vigil/api start
pnpm --filter @vigil/web dev
```

The web app proxies `/vigil-api` to `VIGIL_API_URL`, default `http://127.0.0.1:8787`. The address book is filled from block 66840976. Mint, burn, and redeem stay disabled until a wallet is connected. No Closure Note book is bound, so the market page has no touch. A position's worst case is the paired collateral; a naked leg can redeem zero. Cost and coverage stay blank because the index does not store them.

## Phase 12

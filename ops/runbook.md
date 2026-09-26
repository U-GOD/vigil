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

## Phase 9

## Phase 10

## Phase 11

## Phase 12

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

## Phase 4

## Phase 5

## Phase 6

## Phase 7

## Phase 8

## Phase 9

## Phase 10

## Phase 11

## Phase 12

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

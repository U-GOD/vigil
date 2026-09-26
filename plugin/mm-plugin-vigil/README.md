# mm-plugin-vigil

Closure-risk commands for the MetaMask Agent Wallet. The plugin holds no key and does not broadcast by itself. Writes go through `walletExecutor`.

The browser extension is a different product from the `mm` CLI. Installing this package does not connect the extension.

## Install

From this directory, after `pnpm --filter mm-plugin-vigil build`:

```
mm doctor
mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
mm help vigil
```

Install from the directory so the consent screen can read `oclif.manifest.json`. A local install is unverified until the package is published. `experimentalAllowUnverifiedInstalls` is what allows that.

Chain-touching commands target Monad testnet, chain id 10143. The account that signs needs MON for gas. Do not paste a private key into the shell.

## Commands

| Command | What it does |
| --- | --- |
| `mm vigil markets` | Calendar window, deployment status, and whether a book is bound. |
| `mm vigil positions` | Coverage and worst case from the inventory and note balance you pass. |
| `mm vigil quote NVDA` | Sourced fair value. A model band until a book is bound. |
| `mm vigil policy` | Local risk file. A second layer on Agent Wallet policy, not a substitute. |
| `mm vigil cover` | Size `Q = (kUp + kDn) · V · coverage`, then lift or mint-and-sell. |
| `mm vigil mint` | Mint or, with `--burn`, burn a pair through PolicyAdapter. |
| `mm vigil underwrite` | Sell protection across a basket. Skips earnings names. |
| `mm vigil roll --if-pinned` | Widen the cap when the gap is outside the current one. |
| `mm vigil settle` | Redeem after finalization and print hedge P&L. |
| `mm vigil watch --interval 60s --until session-end` | Foreground loop. Each action is still signed. |

`mm vigil watch` is not a daemon. For a schedule, run `mm vigil cover --once` or `mm vigil roll --if-pinned` from cron or Task Scheduler. MFA still applies. Unattended operation stops where the Agent Wallet policy stops.

## What is not live

PolicyAdapter, the closure vault, and the session registry have no testnet address yet. No Closure Note book is registered. `mm vigil cover` against this tree refuses to submit. That refusal is the command working. A fill appears only after a deploy, a Kuru listing, and a funded 10143 account.

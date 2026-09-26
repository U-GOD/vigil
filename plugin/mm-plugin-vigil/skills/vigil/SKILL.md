---
name: vigil
description: Hedge scheduled equity close-to-open risk with Vigil Closure Notes on Monad. Use when the user holds tokenized equity into a closure, a cap is pinned, or settled notes are unredeemed.
---

# Vigil

Vigil clears the close-to-open return of a named equity. A Closure Note pair is fully collateralized. CN-DN is the long hedge against a gap down. Settlement uses the official auction prints, after trading has halted.

The skill never handles keys. It cannot bypass signing, the Agent Wallet policy, or MFA. Every write is a `walletExecutor` request. The local file from `mm vigil policy` is a second layer on that policy, not a substitute.

## When to use it

Reach for Vigil when any of these are true:

- The user holds tokenized equity and a cash session is about to close, or is already inside the close-to-open window.
- An existing hedge is pinned at its cap.
- A session has finalized and notes are still unredeemed.

Do not use it to invent a price, a fill, or a book. If `mm vigil markets` says no Closure Note book is registered, stop before any order.

## Decision procedure

1. Read inventory and the account. The account is the address the user tells you to pass. Do not read a recovery phrase.
2. Read `mm vigil policy`. Reject the idea if the cost, cap, coverage, or notional is outside that file.
3. `mm vigil quote TICKER`. The band is a model until a book is bound.
4. Size with `Q = (kUp + kDn) · inventory · coverage`. Coverage and caps are WAD. Inventory and notes are 6-decimal collateral units.
5. Choose the venue. Lift DN offers when the ask is inside the cost limit. If the book is one-sided, mint the pair and rest a post-only sell of UP.
6. Submit with `mm vigil cover`. Each transaction is signed by the Agent Wallet. Print the rationale the command emits. Record the hash it returns.
7. After the open, `mm vigil settle` only once the oracle is finalized. Report unhedged P&L and redemption. Withdrawing from AccountCore is a separate explicit request. Never fold it into settle.

## Natural language

Before Friday's close, neutralize my tokenized equity book through the weekend, spend no more than 20 basis points, and don't use caps tighter than 5%.

- `mm vigil policy --write --max-cost-bps 20 --min-cap-wad 50000000000000000`
- `mm vigil quote NVDA`
- `mm vigil cover NVDA --inventory <6-decimal inventory> --account <address> --once`

Sell weekend closure protection across my watchlist, skip anything reporting earnings, cap total exposure at $500k.

- Put the earnings names in `--earnings-excluded` and set `--aggregate-notional 500000000000` (6-decimal collateral units).
- `mm vigil underwrite --basket NVDA:1000000000,AAPL:1000000000 --account <address>`

If NVDAx trades more than 6% away from Friday's close, widen my cap and tell me what it cost.

- `mm vigil roll NVDA --if-pinned --gap 60000000000000000 --current-k <current cap WAD> --inventory <units> --pairs <held> --fair-up <WAD> --account <address>`
- A gap inside the cap is a no-op. No transaction is submitted.

How much would an unhedged book have lost last weekend versus what I paid?

- `mm vigil settle TICKER --account <address> --inventory <units> --premium <units> --p-close <WAD> --p-open <WAD> --k <WAD> --dn <notes>`
- Read the unhedged counterfactual and the redemption in the command output. Do not treat a model band as that result.

Redeem everything that settled this morning and show me realized hedge P&L.

- Confirm `mm vigil markets` and the settle output. Redeem only after finalization.
- The command reports redemption against the unhedged counterfactual. It does not withdraw from AccountCore.

## Refusal

Stop, explain which condition fired, and do not submit when:

- There is no live closure session.
- The cost is above the local policy, or the cap is tighter than the policy minimum.
- Collateral is short of the sized hedge.
- The market is halted. Note transfers revert while halted, so the adapter cannot burn or redeem until the halt lifts.
- The oracle is not finalized.
- PolicyAdapter is not deployed, or the Closure Note book is not bound.
- No free order slot was read from the book.
- A signer authorization would use the WITHDRAW bit. A delegate, when requested, receives only the TRADE value read from AccountCore.

## Scheduling

Agent Wallet is not a daemon. Two ways to stay with a session:

- `mm vigil watch NVDA --inventory <units> --account <address> --interval 60s --until session-end` in a foreground terminal.
- Cron or Task Scheduler calling `mm vigil cover NVDA --inventory <units> --account <address> --once` and `mm vigil roll NVDA --if-pinned ...`.

MFA still applies to each transaction. Unattended trading only goes as far as the user's Agent Wallet policy allows. That is the design.

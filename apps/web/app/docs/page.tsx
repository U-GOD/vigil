import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manual — Vigil",
  description: "How to run the Vigil agent commands on Monad testnet.",
};

const contents = [
  ["install", "Install"],
  ["clock", "Clock"],
  ["read", "Read"],
  ["mint", "Mint"],
  ["hedge", "Hedge"],
  ["policy", "Policy"],
  ["watch", "Watch"],
  ["redeem", "Redeem"],
] as const;

export default function ManualPage() {
  return (
    <div className="manual">
      <nav className="manual-index" aria-label="Manual">
        <p>Contents</p>
        {contents.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      <article>
        <h1>Manual</h1>
        <p>
          The pages Session, Market, Position, Settlement, and Surface are the desk. Connect the
          browser wallet there to mint and redeem. The commands below are the other door: MetaMask
          Agent Wallet, on Monad testnet, chain 10143.
        </p>
        <p>
          The browser extension and the <code>mm</code> program are different products. Installing
          the plugin does not connect the extension. Every write stops for Guard mode. The plugin
          does not hold a key.
        </p>

        <h2 id="install">Install</h2>
        <p>Node 22.18 or later. Then the Agent Wallet CLI:</p>
        <pre>{`npm install -g @metamask/agent-wallet@latest
mm doctor
mm login
mm init
mm doctor`}</pre>
        <p>
          <code>mm doctor</code> should show authenticated and initialized before a write. From{" "}
          <code>plugin/mm-plugin-vigil</code>, after <code>pnpm --filter mm-plugin-vigil build</code>:
        </p>
        <pre>{`mm config set experimentalPlugins true
mm config set experimentalAllowUnverifiedInstalls true
mm plugins install "file:$PWD" --accept-permissions
mm help vigil`}</pre>
        <p>
          On Windows, install with a forward-slash path to that folder. A <code>file:C:\…</code>{" "}
          path is not a package name. <code>mm help vigil</code> lists the commands.
        </p>

        <h2 id="clock">Clock</h2>
        <p>
          <code>mint</code>, <code>cover</code>, <code>underwrite</code>, <code>roll</code>, and{" "}
          <code>watch</code> submit only while a session is between its official close and the next
          official open. Session 20261012 is that span from Monday 12 October 2026, 4:00pm New York,
          until Tuesday 13 October 2026, 9:30am New York. Outside it they print “No live closure
          session” and send nothing.
        </p>
        <p>
          <code>markets</code>, <code>quote</code>, <code>positions</code>, and <code>policy</code>{" "}
          can be run at any time.
        </p>

        <h2 id="read">Read</h2>
        <pre>{`mm vigil markets
mm vigil markets --at 1791835200
mm vigil quote NVDA
mm vigil positions --inventory 100000000 --notes 0 --k 50000000000000000`}</pre>
        <p>
          <code>markets</code> prints the deployment and whether a Closure Note book is bound.{" "}
          <code>--at</code> is a Unix second. 1791835200 is Monday 4:00pm New York, the first second
          of that session.
        </p>
        <p>
          <code>quote</code> prints a model band. It is not a bid or an ask. If no sourced equity
          price is available, it says no price was invented.
        </p>
        <p>
          Amounts of VUSD and of notes are 6-decimal integers. <code>100000000</code> is 100 VUSD.{" "}
          <code>10000000</code> is 10 notes. Caps are 18-decimal WAD. <code>50000000000000000</code>{" "}
          is 5%. <code>100000000000000000</code> is 10%. <code>250000000000000000</code> is 25%.
        </p>

        <h2 id="mint">Mint</h2>
        <p>
          This is the write that does not need an order book. <code>--account</code> is the Agent
          Wallet that holds the VUSD and signs. <code>--pairs 10000000</code> is 10 pairs.{" "}
          <code>--k</code> must be a symmetric cap: 5/5, 10/10, 15/15, or 25/25.
        </p>
        <pre>{`mm vigil mint NVDA --pairs 10000000 --account <agent-wallet> --k 50000000000000000`}</pre>
        <p>
          The mint fee is 3 basis points on top of the deposit. Ten notes cost a little more than 10
          VUSD. If the allowance is short, Guard mode asks twice: once to approve VUSD to
          PolicyAdapter, once to mint. Burn returns the backing and keeps the fee:
        </p>
        <pre>{`mm vigil mint NVDA --pairs 10000000 --account <agent-wallet> --k 50000000000000000 --burn`}</pre>

        <h2 id="hedge">Hedge</h2>
        <p>
          <code>cover</code> sizes <code>(kUp + kDn) × inventory × coverage</code>. Inventory is in
          6-decimal VUSD units. Coverage defaults to 100%.
        </p>
        <pre>{`mm vigil cover NVDA --inventory 100000000 --account <agent-wallet> --k 50000000000000000`}</pre>
        <p>
          If the downside book has an ask inside the policy cost, it buys that leg. If not, it mints
          the pair, keeps the downside note, and rests a post-only sell of the upside note. Both
          paths need a bound Closure Note book. None is registered, so the command refuses and sends
          nothing.
        </p>
        <pre>{`mm vigil underwrite --basket NVDA:100000000,AAPL:100000000 --account <agent-wallet>`}</pre>
        <p>
          <code>underwrite</code> sells protection across that basket and skips names listed in the
          policy as earnings. A name with no book is skipped.
        </p>
        <pre>{`mm vigil roll NVDA --if-pinned --gap 60000000000000000 --current-k 50000000000000000 --inventory 100000000 --pairs 10000000 --fair-up 500000000000000000 --account <agent-wallet>`}</pre>
        <p>
          <code>roll</code> does nothing while the gap is inside the current cap. Outside it, the
          command burns the tight pair and mints the next wider one. That path also needs a bound
          book.
        </p>

        <h2 id="policy">Policy</h2>
        <p>
          The file <code>~/.vigil/policy.json</code> is a second check in front of Guard mode. It
          does not replace the prompt. Until you write it, the defaults are a 20 basis point cost
          limit, a 5% minimum cap, allowed caps of 10% and 25% when <code>--k</code> is omitted,
          full coverage, 100,000 VUSD on one name, and 500,000 VUSD across a basket.
        </p>
        <pre>{`mm vigil policy
mm vigil policy --write --max-cost-bps 20 --min-cap-wad 50000000000000000
mm vigil policy --write --earnings-excluded NVDA,TSLA`}</pre>

        <h2 id="watch">Watch</h2>
        <pre>{`mm vigil watch NVDA --inventory 100000000 --account <agent-wallet> --interval 60s --until session-end`}</pre>
        <p>
          This loop stays in the terminal you leave open. It is not a background service. Each pass
          is another <code>cover</code>, and each one still waits for Guard mode.{" "}
          <code>--until session-end</code> stops at the open. <code>--delegate &lt;address&gt;</code>{" "}
          can authorize a TRADE-only Kuru signer until that open. It does not grant withdraw.
        </p>

        <h2 id="redeem">Redeem</h2>
        <pre>{`mm vigil settle NVDA --account <agent-wallet> --inventory 100000000 --premium 0 --p-close 200000000000000000000 --p-open 210000000000000000000 --k 50000000000000000 --dn 10000000`}</pre>
        <p>
          <code>settle</code> prints the unhedged result, the redemption, and the premium from the
          numbers you pass. A price of 200 dollars is 200 followed by 18 zeros. Redeeming a
          finalized position is the Settlement page, with the browser wallet, after the oracle is
          finalized.
        </p>
      </article>
    </div>
  );
}

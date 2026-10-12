"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { burnPairRequest, mintPairRequest } from "@vigil/sdk/policy";
import { getJson } from "@/lib/api";
import { capLabel, shortId, wadPercent } from "@/lib/format";
import { parseRaw, useMonadWrite } from "@/lib/wallet";
import type { FairResponse, MarketRow, MarketsResponse } from "@/lib/types";

export default function MarketPage() {
  return (
    <Suspense fallback={<p>Loading.</p>}>
      <Market />
    </Suspense>
  );
}

function Market() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const anchor = params.get("anchor") ?? "";
  const markets = useQuery({
    queryKey: ["markets"],
    queryFn: () => getJson<MarketsResponse>("/markets"),
  });
  const rows = markets.data?.markets ?? [];
  const row = rows.find((item) => item.marketId === id.toLowerCase());
  const fair = useQuery({
    queryKey: ["fair", id, anchor],
    enabled: id.length > 0 && /^\d+$/.test(anchor),
    queryFn: () => getJson<FairResponse>(`/fairvalue/${id}?anchor=${anchor}`),
  });

  return (
    <>
      <h1>Market</h1>
      <p className="lede">The book is the Kuru touch stored by the index. This page is not a price chart.</p>
      {markets.data?.reason ? <p>{markets.data.reason}</p> : null}
      {markets.isError ? <p className="error">{markets.error.message}</p> : null}
      <form action="/market" method="get" className="inline">
        <label>
          Market id <input name="id" defaultValue={id} size={42} spellCheck={false} />
        </label>
        <button type="submit">Open</button>
      </form>
      <Picker rows={rows} current={row?.marketId} />
      {id && !row && markets.data ? <p>That market is not indexed.</p> : null}
      {row ? <MarketDetail row={row} policy={markets.data?.policy ?? null} anchor={anchor} fair={fair.data} /> : null}
    </>
  );
}

function Picker({ rows, current }: { rows: MarketRow[]; current: string | undefined }) {
  if (rows.length === 0) return null;
  const sessions = [...new Set(rows.map((row) => row.sessionId))];
  return (
    <div className="picker">
      {sessions.map((session) => (
        <div key={session} className="picker-row">
          <span className="picker-session">{session}</span>
          <span className="chips">
            {rows
              .filter((row) => row.sessionId === session)
              .map((row) => (
                <Link
                  key={row.marketId}
                  href={`/market?id=${row.marketId}`}
                  className="chip"
                  aria-current={row.marketId === current ? "page" : undefined}
                >
                  {row.tickerLabel} {capLabel(row)}
                </Link>
              ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function MarketDetail({
  row,
  policy,
  anchor,
  fair,
}: {
  row: MarketRow;
  policy: string | null;
  anchor: string;
  fair: FairResponse | undefined;
}) {
  const wallet = useMonadWrite();
  const [inputError, setInputError] = useState<string | null>(null);
  const bound = row.bookUp !== null && row.bookDn !== null;
  const canWrite = policy !== null && isAddress(policy) && wallet.connected && !wallet.busy;

  function send(kind: "mint" | "burn", form: FormData) {
    if (!policy || !wallet.address || !isAddress(policy)) return;
    const pairs = parseRaw(form.get("pairs"));
    if (pairs === null || pairs === 0n) {
      setInputError("Pairs must be a whole number of 6-decimal units above zero. 1000000 is one pair.");
      return;
    }
    setInputError(null);
    const request =
      kind === "mint"
        ? mintPairRequest(policy as Address, row.marketId as Hex, pairs, wallet.address)
        : burnPairRequest(policy as Address, row.marketId as Hex, pairs, wallet.address);
    wallet.send(request);
  }

  return (
    <>
      <h2>Book</h2>
      <dl>
        <dt>Ticker</dt>
        <dd>
          {row.tickerLabel} {row.sessionId}
        </dd>
        <dt>Market id</dt>
        <dd className="mono" title={row.marketId}>
          {shortId(row.marketId)}
        </dd>
        <dt>State</dt>
        <dd>{row.state}</dd>
        <dt>Cap</dt>
        <dd className="mono">{capLabel(row)}</dd>
        <dt>UP book</dt>
        <dd className="mono">{row.bookUp ? shortId(row.bookUp) : "not bound"}</dd>
        <dt>DN book</dt>
        <dd className="mono">{row.bookDn ? shortId(row.bookDn) : "not bound"}</dd>
      </dl>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Side</th>
              <th className="num">Price</th>
              <th className="num">Size</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Bid</td>
              <td className="num">{wadPercent(row.bidUp)}</td>
              <td className="num">{row.depthBid}</td>
            </tr>
            <tr>
              <td>Ask</td>
              <td className="num">{wadPercent(row.askUp)}</td>
              <td className="num">{row.depthAsk}</td>
            </tr>
            <tr>
              <td>Mid</td>
              <td className="num">{wadPercent(row.midUp)}</td>
              <td className="num">n/a</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>{bound ? "Touch only. The index does not keep the rest of the ladder." : "No order book is bound."}</p>
      {row.bookError ? <p className="error">{row.bookError}</p> : null}

      <h2>Fair value</h2>
      <p>The index does not fetch an anchor. Enter one as an integer in WAD.</p>
      <form action="/market" method="get" className="inline">
        <input type="hidden" name="id" value={row.marketId} />
        <label>
          Anchor <input name="anchor" defaultValue={anchor} size={24} inputMode="numeric" />
        </label>
        <button type="submit">Read fair value</button>
      </form>
      {fair ? (
        <dl>
          <dt>Close</dt>
          <dd className="mono">{fair.close ?? "n/a"}</dd>
          <dt>UP</dt>
          <dd className="mono">{wadPercent(fair.fairValueUp)}</dd>
          <dt>DN</dt>
          <dd className="mono">{wadPercent(fair.fairValueDn)}</dd>
          <dt>Detail</dt>
          <dd>{fair.detail}</dd>
        </dl>
      ) : null}
      <p>A fair-value band needs a two-sided book. {row.midUp ? `Mid is ${wadPercent(row.midUp)}.` : "None is indexed."}</p>

      <h2>Mint and burn</h2>
      <form
        className="inline"
        onSubmit={(event) => {
          event.preventDefault();
          send("mint", new FormData(event.currentTarget));
        }}
      >
        <label>
          Pairs <input name="pairs" defaultValue="1000000" size={12} inputMode="numeric" />
        </label>
        <button type="submit" disabled={!canWrite}>
          Mint pair
        </button>
        <button
          type="button"
          disabled={!canWrite}
          onClick={(event) => {
            const form = event.currentTarget.form;
            if (form) send("burn", new FormData(form));
          }}
        >
          Burn pair
        </button>
      </form>
      <p className="hint">
        Raw 6-decimal units: 1000000 is one pair. Minting pulls the collateral plus the mint fee, so the collateral
        needs an allowance for PolicyAdapter first.
      </p>
      <p>
        {policy === null
          ? "PolicyAdapter is not deployed."
          : !wallet.connected
            ? "Connect a wallet to mint or burn."
            : `PolicyAdapter ${shortId(policy)} will receive this transaction.`}
      </p>
      {inputError ? <p className="status error">{inputError}</p> : null}
      {wallet.status}

      <h2>Trade</h2>
      <p>{bound ? "The book is bound." : "No order book is bound, so this does not submit an order."}</p>
    </>
  );
}

"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useWriteContract } from "wagmi";
import { isAddress, type Address, type Hex } from "viem";
import { burnPairRequest, mintPairRequest } from "@vigil/sdk/policy";
import { getJson } from "@/lib/api";
import { shortId, wadPercent } from "@/lib/format";
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
  const row = markets.data?.markets.find((item) => item.marketId === id.toLowerCase());
  const fair = useQuery({
    queryKey: ["fair", id, anchor],
    enabled: id.length > 0 && /^\d+$/.test(anchor),
    queryFn: () => getJson<FairResponse>(`/fairvalue/${id}?anchor=${anchor}`),
  });

  return (
    <>
      <h1>Market</h1>
      <p>The book is the Kuru touch stored by the index. This page is not a price chart.</p>
      <p>{markets.data?.reason}</p>
      <form action="/market" method="get">
        <label>
          Market id <input name="id" defaultValue={id} size={42} />
        </label>
        <button type="submit">Open</button>
      </form>
      {markets.data && markets.data.markets.length > 0 ? (
        <p>
          {markets.data.markets.map((item) => (
            <Link key={item.marketId} href={`/market?id=${item.marketId}`}>
              {item.tickerLabel} {item.sessionId}{" "}
            </Link>
          ))}
        </p>
      ) : null}
      {id && !row && markets.data ? <p>That market is not indexed.</p> : null}
      {row ? <MarketDetail row={row} policy={markets.data?.policy ?? null} anchor={anchor} fair={fair.data} /> : null}
    </>
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
  const account = useAccount();
  const write = useWriteContract();
  const bound = row.bookUp !== null && row.bookDn !== null;
  const canWrite = policy !== null && account.address !== undefined;

  function send(kind: "mint" | "burn", form: FormData) {
    if (!policy || !account.address || !isAddress(policy)) return;
    const pairs = BigInt(String(form.get("pairs") ?? "0"));
    const request =
      kind === "mint"
        ? mintPairRequest(policy as Address, row.marketId as Hex, pairs, account.address)
        : burnPairRequest(policy as Address, row.marketId as Hex, pairs, account.address);
    write.writeContract({
      address: request.address,
      abi: request.abi,
      functionName: request.functionName,
      args: request.args,
    });
  }

  return (
    <>
      <h2>Book</h2>
      <dl>
        <dt>Ticker</dt>
        <dd>
          {row.tickerLabel} {row.sessionId}
        </dd>
        <dt>State</dt>
        <dd>{row.state}</dd>
        <dt>Cap</dt>
        <dd className="num">
          {wadPercent(row.kUp)} / {wadPercent(row.kDn)}
        </dd>
        <dt>UP book</dt>
        <dd className="num">{row.bookUp ? shortId(row.bookUp) : "not bound"}</dd>
        <dt>DN book</dt>
        <dd className="num">{row.bookDn ? shortId(row.bookDn) : "not bound"}</dd>
      </dl>
      <table>
        <thead>
          <tr>
            <th>Side</th>
            <th>Price</th>
            <th>Size</th>
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
      <p>{bound ? "Touch only. The index does not keep the rest of the ladder." : "No order book is bound."}</p>
      {row.bookError ? <p>{row.bookError}</p> : null}

      <h2>Fair value</h2>
      <p>The index does not fetch an anchor. Enter one as an integer in WAD.</p>
      <form action="/market" method="get">
        <input type="hidden" name="id" value={row.marketId} />
        <label>
          Anchor <input name="anchor" defaultValue={anchor} size={24} />
        </label>
        <button type="submit">Read fair value</button>
      </form>
      {fair ? (
        <dl>
          <dt>Close</dt>
          <dd className="num">{fair.close ?? "n/a"}</dd>
          <dt>UP</dt>
          <dd className="num">{wadPercent(fair.fairValueUp)}</dd>
          <dt>DN</dt>
          <dd className="num">{wadPercent(fair.fairValueDn)}</dd>
          <dt>Detail</dt>
          <dd>{fair.detail}</dd>
        </dl>
      ) : null}
      <p>A fair-value band needs a two-sided book. {row.midUp ? `Mid is ${wadPercent(row.midUp)}.` : "None is indexed."}</p>

      <h2>Mint and burn</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send("mint", new FormData(event.currentTarget));
        }}
      >
        <label>
          Pairs <input name="pairs" defaultValue="0" size={12} />
        </label>
        <button type="submit" disabled={!canWrite}>
          Mint pair
        </button>{" "}
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
      <p>{canWrite ? "PolicyAdapter will receive this transaction." : "PolicyAdapter is not deployed, or the wallet is not connected."}</p>
      {write.error ? <p>{write.error.message}</p> : null}

      <h2>Trade</h2>
      <p>{bound ? "The book is bound." : "No order book is bound, so this does not submit an order."}</p>
    </>
  );
}

"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { redeemRequest } from "@vigil/sdk/policy";
import { getJson } from "@/lib/api";
import { capLabel, exchangeLabel, shortId, wadPercent } from "@/lib/format";
import { parseRaw, useMonadWrite } from "@/lib/wallet";
import type { MarketRow, MarketsResponse, SessionResponse } from "@/lib/types";

export default function SettlementPage() {
  return (
    <Suspense fallback={<p>Loading.</p>}>
      <Settlement />
    </Suspense>
  );
}

function Settlement() {
  const params = useSearchParams();
  const sessionId = params.get("session") ?? "";
  const markets = useQuery({ queryKey: ["markets"], queryFn: () => getJson<MarketsResponse>("/markets") });
  const session = useQuery({
    queryKey: ["session", sessionId],
    enabled: sessionId.length > 0,
    queryFn: () => getJson<SessionResponse>(`/sessions/${sessionId}`),
  });
  const ids = [...new Set((markets.data?.markets ?? []).map((row) => row.sessionId))];

  return (
    <>
      <h1>Settlement</h1>
      <p>Prints, the frozen split, and redemption. The reporter set, the median, and the dispute window are not in the index.</p>
      <p>{session.data?.reason ?? markets.data?.reason}</p>
      {session.isError ? <p className="error">{session.error.message}</p> : null}
      <form action="/settlement" method="get" className="inline">
        <label>
          Session <input name="session" defaultValue={sessionId} size={16} />
        </label>
        <button type="submit">Open</button>
      </form>
      {ids.length > 0 ? (
        <p className="chips">
          {ids.map((id) => (
            <Link
              key={id}
              href={`/settlement?session=${id}`}
              className="chip"
              aria-current={id === sessionId ? "page" : undefined}
            >
              {id}
            </Link>
          ))}
        </p>
      ) : null}
      {session.data ? (
        <SessionDetail
          data={session.data}
          markets={(markets.data?.markets ?? []).filter((row) => row.sessionId === sessionId)}
        />
      ) : null}
    </>
  );
}

function SessionDetail({ data, markets }: { data: SessionResponse; markets: MarketRow[] }) {
  const wallet = useMonadWrite();
  const [inputError, setInputError] = useState<string | null>(null);
  const session = data.session;
  const canRedeem = data.policy !== null && isAddress(data.policy) && wallet.connected && !wallet.busy;

  return (
    <>
      <h2>Window</h2>
      {session ? (
        <dl>
          <dt>Exchange</dt>
          <dd title={session.exchange}>{exchangeLabel(session.exchange)}</dd>
          <dt>Close</dt>
          <dd className="mono">{utc(session.closeTs)}</dd>
          <dt>Open</dt>
          <dd className="mono">{utc(session.openTs)}</dd>
          <dt>Fallback</dt>
          <dd className="mono">{utc(session.fallbackDeadline)}</dd>
          <dt>Print band</dt>
          <dd className="mono">{session.printBandSecs}s</dd>
          <dt>No auction</dt>
          <dd>{session.noAuction ? "yes" : "no"}</dd>
        </dl>
      ) : (
        <p>This session is not indexed.</p>
      )}

      <h2>Prints</h2>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Kind</th>
            <th className="num">Price</th>
            <th className="num">Candidate</th>
            <th>Finalized</th>
            <th>Voided</th>
          </tr>
        </thead>
        <tbody>
          {data.prints.length === 0 ? (
            <tr>
              <td colSpan={6}>No prints are indexed.</td>
            </tr>
          ) : (
            data.prints.map((row) => (
              <tr key={`${row.ticker}-${row.kind}`}>
                <td>{row.tickerLabel}</td>
                <td>{row.kind}</td>
                <td className="num">{row.price ?? "n/a"}</td>
                <td className="num">{row.candidate ?? "n/a"}</td>
                <td>{row.finalized ? "yes" : "no"}</td>
                <td>{row.voided ? "yes" : "no"}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      <h2>Frozen split</h2>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th className="num">sUp</th>
            <th>Fallback</th>
            <th className="num">Block</th>
          </tr>
        </thead>
        <tbody>
          {data.settlements.length === 0 ? (
            <tr>
              <td colSpan={4}>No settlement is indexed.</td>
            </tr>
          ) : (
            data.settlements.map((row) => (
              <tr key={row.marketId}>
                <td className="num">{shortId(row.marketId)}</td>
                <td className="num">{wadPercent(row.sUp)}</td>
                <td>{row.fallbackSettle ? "yes" : "no"}</td>
                <td className="num">{row.blockNumber}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>

      <h2>Redeem</h2>
      <form
        className="inline"
        onSubmit={(event) => {
          event.preventDefault();
          if (!data.policy || !wallet.address || !isAddress(data.policy)) return;
          const form = new FormData(event.currentTarget);
          const marketId = String(form.get("marketId") ?? "");
          const up = parseRaw(form.get("up"));
          const dn = parseRaw(form.get("dn"));
          if (!/^0x[0-9a-fA-F]{64}$/.test(marketId)) {
            setInputError("Pick a market.");
            return;
          }
          if (up === null || dn === null || up + dn === 0n) {
            setInputError("UP and DN are whole 6-decimal units, and at least one must be above zero.");
            return;
          }
          setInputError(null);
          wallet.send(redeemRequest(data.policy as Address, marketId as Hex, up, dn, wallet.address));
        }}
      >
        <label>
          Market{" "}
          {markets.length > 0 ? (
            <select name="marketId" defaultValue={markets[0]?.marketId}>
              {markets.map((row) => (
                <option key={row.marketId} value={row.marketId}>
                  {row.tickerLabel} {capLabel(row)} · {row.state}
                </option>
              ))}
            </select>
          ) : (
            <input name="marketId" size={42} spellCheck={false} />
          )}
        </label>
        <label>
          UP <input name="up" defaultValue="0" size={10} />
        </label>
        <label>
          DN <input name="dn" defaultValue="0" size={10} />
        </label>
        <button type="submit" disabled={!canRedeem}>
          Redeem
        </button>
      </form>
      <p>
        {data.policy === null
          ? "PolicyAdapter is not deployed."
          : !wallet.connected
            ? "Connect a wallet to redeem."
            : `PolicyAdapter ${shortId(data.policy)} will receive this redemption. It reverts until the market is finalized.`}
      </p>
      {inputError ? <p className="status error">{inputError}</p> : null}
      {wallet.status}
    </>
  );
}

function utc(ts: string): string {
  if (!/^\d+$/.test(ts)) return ts;
  return `${new Date(Number(ts) * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

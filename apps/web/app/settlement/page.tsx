"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAddress, type Address, type Hex } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { redeemRequest } from "@vigil/sdk/policy";
import { getJson } from "@/lib/api";
import { shortId, wadPercent } from "@/lib/format";
import type { MarketsResponse, SessionResponse } from "@/lib/types";

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
      <form action="/settlement" method="get">
        <label>
          Session <input name="session" defaultValue={sessionId} size={16} />
        </label>
        <button type="submit">Open</button>
      </form>
      {ids.length > 0 ? (
        <p>
          {ids.map((id) => (
            <Link key={id} href={`/settlement?session=${id}`}>
              {id}{" "}
            </Link>
          ))}
        </p>
      ) : null}
      {session.data ? <SessionDetail data={session.data} /> : null}
    </>
  );
}

function SessionDetail({ data }: { data: SessionResponse }) {
  const account = useAccount();
  const write = useWriteContract();
  const session = data.session;
  const canRedeem = data.policy !== null && account.address !== undefined;

  return (
    <>
      <h2>Window</h2>
      {session ? (
        <dl>
          <dt>Exchange</dt>
          <dd>{session.exchange}</dd>
          <dt>Close</dt>
          <dd className="num">{session.closeTs}</dd>
          <dt>Open</dt>
          <dd className="num">{session.openTs}</dd>
          <dt>Fallback</dt>
          <dd className="num">{session.fallbackDeadline}</dd>
          <dt>Print band</dt>
          <dd className="num">{session.printBandSecs}s</dd>
          <dt>No auction</dt>
          <dd>{session.noAuction ? "yes" : "no"}</dd>
        </dl>
      ) : (
        <p>This session is not indexed.</p>
      )}

      <h2>Prints</h2>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Kind</th>
            <th>Price</th>
            <th>Candidate</th>
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

      <h2>Frozen split</h2>
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>sUp</th>
            <th>Fallback</th>
            <th>Block</th>
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

      <h2>Redeem</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!data.policy || !account.address || !isAddress(data.policy)) return;
          const form = new FormData(event.currentTarget);
          const marketId = String(form.get("marketId") ?? "");
          const request = redeemRequest(
            data.policy as Address,
            marketId as Hex,
            BigInt(String(form.get("up") ?? "0")),
            BigInt(String(form.get("dn") ?? "0")),
            account.address,
          );
          write.writeContract({
            address: request.address,
            abi: request.abi,
            functionName: request.functionName,
            args: request.args,
          });
        }}
      >
        <label>
          Market <input name="marketId" size={42} />
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
      <p>{canRedeem ? "PolicyAdapter will receive this redemption." : "PolicyAdapter is not deployed, or the wallet is not connected."}</p>
      {write.error ? <p>{write.error.message}</p> : null}
    </>
  );
}

"use client";

import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { timeToHalt, wadPercent } from "@/lib/format";
import type { MarketRow, MarketsResponse, SessionResponse } from "@/lib/types";

export default function SessionBoard() {
  const markets = useQuery({
    queryKey: ["markets"],
    queryFn: () => getJson<MarketsResponse>("/markets"),
    refetchInterval: 15_000,
  });
  const rows = markets.data?.markets ?? [];
  const sessionIds = [...new Set(rows.map((row) => row.sessionId))];
  const sessions = useQueries({
    queries: sessionIds.map((id) => ({
      queryKey: ["session", id],
      queryFn: () => getJson<SessionResponse>(`/sessions/${id}`),
    })),
  });
  const closeById = new Map(
    sessions.flatMap((query) => (query.data?.session ? [[query.data.session.sessionId, query.data.session.closeTs]] : [])),
  );
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <h1>Session board</h1>
      <p>{markets.data?.reason ?? (markets.isError ? markets.error.message : "Reading the index.")}</p>
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Ticker</th>
            <th>Cap</th>
            <th>State</th>
            <th>Time to halt</th>
            <th>Mid</th>
            <th>Implied premium</th>
            <th>Bid depth</th>
            <th>Ask depth</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9}>No markets are indexed.</td>
            </tr>
          ) : (
            rows.map((row) => <BoardRow key={row.marketId} row={row} closeTs={closeById.get(row.sessionId)} now={now} />)
          )}
        </tbody>
      </table>
    </>
  );
}

function BoardRow({ row, closeTs, now }: { row: MarketRow; closeTs: string | undefined; now: number }) {
  return (
    <tr>
      <td>
        <Link href={`/settlement?session=${row.sessionId}`}>{row.sessionId}</Link>
      </td>
      <td>
        <Link href={`/market?id=${row.marketId}`}>{row.tickerLabel}</Link>
      </td>
      <td className="num">
        {wadPercent(row.kUp)} / {wadPercent(row.kDn)}
      </td>
      <td>{row.state}</td>
      <td className="num">{timeToHalt(closeTs, now)}</td>
      <td className="num">{wadPercent(row.midUp)}</td>
      <td className="num">{wadPercent(row.impliedPremium)}</td>
      <td className="num">{row.depthBid}</td>
      <td className="num">{row.depthAsk}</td>
    </tr>
  );
}

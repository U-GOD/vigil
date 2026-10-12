"use client";

import Link from "next/link";
import { useQuery, useQueries } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { capLabel, timeToHalt, wadPercent } from "@/lib/format";
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
  const openById = new Map(
    sessions.flatMap((query) => (query.data?.session ? [[query.data.session.sessionId, query.data.session.openTs]] : [])),
  );
  const now = Math.floor(Date.now() / 1000);

  return (
    <>
      <h1>Session board</h1>
      <p className="lede">
        {markets.isPending
          ? "Reading the index."
          : markets.isError
            ? markets.error.message
            : (markets.data.reason ?? `${rows.length} markets indexed. Halt is the open that ends each closure window.`)}
      </p>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Ticker</th>
            <th className="num">Cap</th>
            <th>State</th>
            <th className="num">Time to halt</th>
            <th className="num">Mid</th>
            <th className="num">Implied premium</th>
            <th className="num">Bid depth</th>
            <th className="num">Ask depth</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={9}>{markets.isPending ? "Loading." : "No markets are indexed."}</td>
            </tr>
          ) : (
            rows.map((row) => <BoardRow key={row.marketId} row={row} openTs={openById.get(row.sessionId)} now={now} />)
          )}
        </tbody>
      </table>
      </div>
    </>
  );
}

function BoardRow({ row, openTs, now }: { row: MarketRow; openTs: string | undefined; now: number }) {
  return (
    <tr>
      <td>
        <Link href={`/settlement?session=${row.sessionId}`}>{row.sessionId}</Link>
      </td>
      <td>
        <Link href={`/market?id=${row.marketId}`}>{row.tickerLabel}</Link>
      </td>
      <td className="num">
        {capLabel(row)}
      </td>
      <td>{row.state}</td>
      <td className="num">{timeToHalt(openTs, now)}</td>
      <td className="num">{wadPercent(row.midUp)}</td>
      <td className="num">{wadPercent(row.impliedPremium)}</td>
      <td className="num">{row.depthBid}</td>
      <td className="num">{row.depthAsk}</td>
    </tr>
  );
}

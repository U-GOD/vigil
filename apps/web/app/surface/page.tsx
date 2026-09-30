"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { wadPercent } from "@/lib/format";
import type { MarketsResponse, SurfaceResponse, TailRow } from "@/lib/types";

export default function SurfacePage() {
  return (
    <Suspense fallback={<p>Loading.</p>}>
      <Surface />
    </Suspense>
  );
}

function Surface() {
  const params = useSearchParams();
  const ticker = params.get("ticker") ?? "";
  const markets = useQuery({ queryKey: ["markets"], queryFn: () => getJson<MarketsResponse>("/markets") });
  const surface = useQuery({
    queryKey: ["surface", ticker],
    enabled: ticker.length > 0,
    queryFn: () => getJson<SurfaceResponse>(`/surface/${encodeURIComponent(ticker)}`),
  });
  const names = [...new Set((markets.data?.markets ?? []).map((row) => row.tickerLabel))];

  return (
    <>
      <h1>Surface</h1>
      <p>Implied closure-jump probabilities across the cap ladder, from two-sided UP mids. An empty book has no surface.</p>
      <p>{surface.data?.detail ?? markets.data?.reason}</p>
      <form action="/surface" method="get">
        <label>
          Ticker <input name="ticker" defaultValue={ticker} size={12} />
        </label>
        <button type="submit">Read</button>
      </form>
      {names.length > 0 ? (
        <p>
          {names.map((name) => (
            <Link key={name} href={`/surface?ticker=${name}`}>
              {name}{" "}
            </Link>
          ))}
        </p>
      ) : null}
      {surface.data?.surface ? (
        <>
          <p>Premium {wadPercent(surface.data.premium)}.</p>
          <Tail title="Above" rows={surface.data.surface.above} />
          <Tail title="Below" rows={surface.data.surface.below} />
          <Tail title="Asymmetry" rows={surface.data.surface.asymmetry} />
        </>
      ) : ticker && surface.data ? (
        <p>No surface is indexed for {ticker}.</p>
      ) : null}
    </>
  );
}

function Tail({ title, rows }: { title: string; rows: TailRow[] }) {
  return (
    <>
      <h2>{title}</h2>
      <table>
        <thead>
          <tr>
            <th>Cap</th>
            <th>Probability</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={2}>None.</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.cap}>
                <td className="num">{wadPercent(row.cap)}</td>
                <td className="num">{wadPercent(row.probability)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </>
  );
}

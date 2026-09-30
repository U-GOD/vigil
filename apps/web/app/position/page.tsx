"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getJson } from "@/lib/api";
import { holdingRisk, shortId, units, wadPercent } from "@/lib/format";
import type { MarketRow, MarketsResponse, PositionsResponse } from "@/lib/types";

export default function PositionPage() {
  return (
    <Suspense fallback={<p>Loading.</p>}>
      <Position />
    </Suspense>
  );
}

function Position() {
  const params = useSearchParams();
  const account = params.get("account") ?? "";
  const markets = useQuery({ queryKey: ["markets"], queryFn: () => getJson<MarketsResponse>("/markets") });
  const positions = useQuery({
    queryKey: ["positions", account],
    enabled: /^0x[0-9a-fA-F]{40}$/.test(account),
    queryFn: () => getJson<PositionsResponse>(`/positions/${account}`),
  });
  const byId = new Map((markets.data?.markets ?? []).map((row) => [row.marketId, row]));

  return (
    <>
      <h1>Position</h1>
      <p>
        A pair redeems one unit of collateral in every settlement, including fallback. A naked leg can redeem zero.
        Worst case redemption is the paired amount. Cost paid and equity coverage are not in the index.
      </p>
      <p>{markets.data?.reason}</p>
      <form action="/position" method="get">
        <label>
          Address <input name="account" defaultValue={account} size={46} />
        </label>
        <button type="submit">Read</button>
      </form>
      {positions.error ? <p>{positions.error.message}</p> : null}
      <table>
        <thead>
          <tr>
            <th>Market</th>
            <th>Cap</th>
            <th>UP</th>
            <th>DN</th>
            <th>Worst case redemption</th>
            <th>Can redeem zero</th>
            <th>Cost</th>
            <th>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {!positions.data ? (
            <tr>
              <td colSpan={8}>Enter an address.</td>
            </tr>
          ) : positions.data.positions.length === 0 ? (
            <tr>
              <td colSpan={8}>No notes are indexed for this address.</td>
            </tr>
          ) : (
            positions.data.positions.map((row) => {
              const market = byId.get(row.marketId);
              const risk = holdingRisk(BigInt(row.up), BigInt(row.dn));
              return (
                <tr key={row.marketId}>
                  <td className="num">{market ? market.tickerLabel : shortId(row.marketId)}</td>
                  <td className="num">{market ? `${wadPercent(market.kUp)} / ${wadPercent(market.kDn)}` : "n/a"}</td>
                  <td className="num">{units(BigInt(row.up))}</td>
                  <td className="num">{units(BigInt(row.dn))}</td>
                  <td className="num">{units(risk.worstRedeem)} VUSD</td>
                  <td className="num">{units(risk.nakedAtRisk)} VUSD</td>
                  <td>Not indexed</td>
                  <td>Not indexed</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
      <p>
        VUSD is the testnet collateral stand-in, 6 decimals. The unhedged counterfactual is the naked amount: without
        the pair, that quantity can redeem zero. An equity inventory is not in the index, so coverage stays blank.
      </p>
      <Unhedged rows={positions.data?.positions ?? []} markets={byId} />
    </>
  );
}

function Unhedged({
  rows,
  markets,
}: {
  rows: { marketId: string; up: string; dn: string }[];
  markets: Map<string, MarketRow>;
}) {
  if (rows.length === 0) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Market</th>
          <th>State</th>
          <th>Frozen sUp</th>
          <th>Unhedged naked UP</th>
          <th>Unhedged naked DN</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const risk = holdingRisk(BigInt(row.up), BigInt(row.dn));
          const market = markets.get(row.marketId);
          return (
            <tr key={row.marketId}>
              <td>{market?.tickerLabel ?? shortId(row.marketId)}</td>
              <td>{market?.state ?? "n/a"}</td>
              <td className="num">{wadPercent(market?.sUp)}</td>
              <td className="num">{units(risk.nakedUp)}</td>
              <td className="num">{units(risk.nakedDn)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

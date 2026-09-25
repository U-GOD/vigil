import { sizeHedge } from "@vigil/riskmodel";
import { fairValueDn } from "@vigil/riskmodel";

const WAD = 10n ** 18n;

export type VaultQuote = {
  ticker: string;
  marketId: string;
  pairs: bigint;
  sellPrice: bigint;
  leg: "dn";
};

/** Quote the protection leg once, inside the 2.5% ticker cap, and only on a bound market. */
export function vaultQuote(input: {
  bound: boolean;
  excluded: boolean;
  alreadyQuoted: boolean;
  ticker: string;
  marketId: string;
  nav: bigint;
  tickerCapBps: bigint;
  inventoryValue: bigint;
  kUp: bigint;
  kDn: bigint;
  coverage: bigint;
  anchor: bigint;
  pClose: bigint;
  adj: bigint;
  premium: bigint;
}): VaultQuote | null {
  if (!input.bound) throw new Error("market is not bound; refusing to quote");
  if (input.excluded || input.alreadyQuoted) return null;
  const cap = (input.nav * input.tickerCapBps) / 10_000n;
  let pairs = sizeHedge(input.inventoryValue, input.kUp, input.kDn, input.coverage);
  if (pairs > cap) pairs = cap;
  if (pairs === 0n) return null;
  const fair = fairValueDn(input.anchor, input.pClose, input.adj, input.kUp, input.kDn);
  const sell = fair + input.premium > WAD ? WAD : fair + input.premium;
  return { ticker: input.ticker, marketId: input.marketId, pairs, sellPrice: sell, leg: "dn" };
}

import { fairValueDn, fairValueUp } from "@vigil/riskmodel";
import { noArbBand } from "@vigil/riskmodel";

const WAD = 10n ** 18n;

export type BookTop = { bid: bigint; ask: bigint };

export type AnchorDecision = {
  path: "none" | "take" | "mint-sell" | "pair-burn";
  edge: bigint;
  halted: boolean;
  reason: string;
};

/** Pick the cheapest positive edge. Halt when the onchain mid and the reference diverge. */
export function anchorDecision(input: {
  bound: boolean;
  spotMid: bigint;
  reference: bigint;
  divergenceBps: bigint;
  pClose: bigint;
  adj: bigint;
  kUp: bigint;
  kDn: bigint;
  bookUp: BookTop;
  bookDn: BookTop;
  inventory: bigint;
  inventoryLimit: bigint;
  sessionLoss: bigint;
  lossCap: bigint;
  takerFee: bigint;
}): AnchorDecision {
  if (!input.bound) return { path: "none", edge: 0n, halted: true, reason: "market is not bound" };
  if (input.sessionLoss >= input.lossCap) {
    return { path: "none", edge: 0n, halted: true, reason: "session loss cap" };
  }
  const gap = abs(input.spotMid - input.reference);
  if (gap * 10_000n > input.reference * input.divergenceBps) {
    return { path: "none", edge: 0n, halted: true, reason: "anchor divergence" };
  }

  const up = fairValueUp(input.spotMid, input.pClose, input.adj, input.kUp, input.kDn, 0n);
  const dn = fairValueDn(input.spotMid, input.pClose, input.adj, input.kUp, input.kDn);
  const bandUp = noArbBand(up, 7000n, 0n, 0n);
  const candidates: { path: AnchorDecision["path"]; edge: bigint }[] = [];

  if (input.bookUp.ask > 0n && input.bookUp.ask < bandUp.low) {
    candidates.push({ path: "take", edge: bandUp.low - input.bookUp.ask - input.takerFee });
  }
  if (input.bookUp.bid > bandUp.high) {
    candidates.push({ path: "take", edge: input.bookUp.bid - bandUp.high - input.takerFee });
  }
  const rich = input.bookUp.bid > up ? input.bookUp.bid - up : input.bookDn.bid > dn ? input.bookDn.bid - dn : 0n;
  if (rich > input.takerFee && input.inventory < input.inventoryLimit) {
    candidates.push({ path: "mint-sell", edge: rich - input.takerFee });
  }
  const midUp = mid(input.bookUp);
  const midDn = mid(input.bookDn);
  if (midUp > 0n && midDn > 0n && midUp + midDn > WAD + input.takerFee * 2n) {
    candidates.push({ path: "pair-burn", edge: midUp + midDn - WAD - input.takerFee * 2n });
  }

  let best: { path: AnchorDecision["path"]; edge: bigint } = { path: "none", edge: 0n };
  for (const candidate of candidates) {
    if (candidate.edge > best.edge) best = candidate;
  }
  return { ...best, halted: false, reason: best.path === "none" ? "no edge" : best.path };
}

function mid(book: BookTop): bigint {
  if (book.bid === 0n || book.ask === 0n) return 0n;
  return (book.bid + book.ask) / 2n;
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

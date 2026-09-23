import { encodeFunctionData } from "viem";
import {
  buildAuthorizeAccountSignerRequest,
  buildDepositRequest as buildDepositFromAccount,
} from "@toxicflow-labs/ts-sdk/account";
import {
  buildBatchRequest,
  buildBurnPassiveLiquidityRequest,
  buildCancelAllOrdersRequest,
  buildCancelBySlotsRequest,
  buildMintPassiveLiquidityRequest,
  buildReplaceBySlotPackedRequest,
  buildSwapRequest,
  encodePackedReplaceOps,
} from "@toxicflow-labs/ts-sdk/spot";
import { describe, expect, it } from "vitest";
import { loadDeployments } from "../src/deployments.js";
import {
  accountOnboardingCalls,
  approveAccountCoreRequest,
  claimUsdcRequest,
} from "../src/kuru/account.js";
import { CN_BOOK_SPEC } from "../src/kuru/bookSpec.js";
import { keeperCall, pluginCall } from "../src/kuru/encode.js";
import {
  batchRequest,
  burnPassiveRequest,
  cancelAllRequest,
  mintPassiveRequest,
  passiveSeedRequest,
  replaceBySlotRequest,
  swapRequest,
} from "../src/kuru/orders.js";
import {
  bestBidAskRequest,
  l2BookRequest,
  marketParamsRequest,
  marketStateRequest,
  orderIdRequest,
} from "../src/kuru/reads.js";
import { SLOT_COUNT, allocateSlot, cancelSlot, placeBatch } from "../src/kuru/slots.js";
import { authorizeTradeSignerRequest, depositRequest } from "../src/kuru/account.js";

const { kuru } = loadDeployments(10143);
const market = kuru.monUsdc;
const userId = 7n;
const clientOrderId = `0x${"ab".repeat(32)}` as const;

function sdkData(request: {
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
}): string {
  return encodeFunctionData({
    abi: request.abi,
    functionName: request.functionName,
    args: request.args as never,
  });
}

function emptyBook(): bigint[] {
  return Array.from({ length: SLOT_COUNT }, () => 0n);
}

describe("kuru encoders", () => {
  it("matches the SDK for GTC, IOC, FOK, and post-only batch orders", () => {
    const tifs = ["gtc", "ioc", "fok"] as const;
    for (const tif of tifs) {
      const params = {
        market,
        userId,
        clientOrderId,
        orders: [
          {
            side: "buy" as const,
            quantity: 2_000_000n,
            price: 500_000n,
            tif,
            executionInstruction: tif === "gtc" ? ("postOnly" as const) : ("none" as const),
          },
        ],
      };
      const wrapped = batchRequest(params);
      const direct = buildBatchRequest(params);
      expect(pluginCall(wrapped)).toEqual(keeperCall(wrapped));
      expect(pluginCall(wrapped).to).toBe(market);
      expect(pluginCall(wrapped).data).toBe(sdkData(direct));
    }
  });

  it("matches the SDK for replace, swap, passive mint, burn, and cancel-all", () => {
    const ops = [
      {
        slotIdx: 3,
        side: "sell" as const,
        price: 510_000n,
        size: 1_000_000n,
        postOnly: true,
      },
    ];
    const replace = {
      market,
      userId,
      clientOrderId,
      ops,
    };
    expect(pluginCall(replaceBySlotRequest(replace)).data).toBe(
      sdkData(
        buildReplaceBySlotPackedRequest({
          market,
          userId,
          clientOrderId,
          packedOps: encodePackedReplaceOps(ops),
        }),
      ),
    );

    const swap = {
      market,
      userId,
      isBuy: true,
      amountIn: 50_000_000n,
      minAmountOut: 1n,
      deadline: 1_800_000_000n,
    };
    expect(pluginCall(swapRequest(swap)).data).toBe(sdkData(buildSwapRequest(swap)));

    const mint = {
      market,
      userId,
      lowPrice: 490_000n,
      baseAmount: 1_000_000n,
      quoteAmount: 1_000_000n,
      minSharesOut: 0n,
      deadline: 1_800_000_000n,
    };
    expect(pluginCall(mintPassiveRequest(mint)).data).toBe(
      sdkData(buildMintPassiveLiquidityRequest(mint)),
    );

    const burn = { market, userId, positionId: 4n, sharesToBurn: 10n };
    expect(pluginCall(burnPassiveRequest(burn)).data).toBe(
      sdkData(buildBurnPassiveLiquidityRequest(burn)),
    );

    expect(pluginCall(cancelAllRequest({ market, userId })).data).toBe(
      sdkData(buildCancelAllOrdersRequest({ market, userId })),
    );
  });

  it("refuses a passive seed until the listing is bound", () => {
    const mint = {
      market,
      userId,
      lowPrice: 490_000n,
      baseAmount: 1_000_000n,
      quoteAmount: 1_000_000n,
    };
    expect(() => passiveSeedRequest(false, mint)).toThrow(/not bound/);
    expect(pluginCall(passiveSeedRequest(true, mint)).data).toBe(
      sdkData(buildMintPassiveLiquidityRequest(mint)),
    );
  });

  it("reads the live MON/USDC book through the SDK order-book ABI", () => {
    expect(bestBidAskRequest(market).functionName).toBe("bestBidAsk");
    expect(l2BookRequest(market, 5n).args).toEqual([5n]);
    expect(marketParamsRequest(market).address).toBe(market);
    expect(orderIdRequest(market, userId, 0).functionName).toBe("getOrderId");
    expect(marketStateRequest(market).functionName).toBe("marketState");
    expect(marketParamsRequest(market).abi).toBeTruthy();
  });
});

describe("slot manager", () => {
  it("uses one of 62 slots and refuses a full book", () => {
    expect(SLOT_COUNT).toBe(62);
    const open = emptyBook();
    expect(allocateSlot(open)).toBe(0);
    const almost = emptyBook();
    for (let i = 0; i < SLOT_COUNT - 1; i += 1) almost[i] = 1n;
    expect(allocateSlot(almost)).toBe(SLOT_COUNT - 1);
    expect(() => allocateSlot(Array.from({ length: SLOT_COUNT }, () => 9n))).toThrow(
      /no free slot/,
    );
    expect(() => allocateSlot([0n])).toThrow(/62/);

    const placed = placeBatch(open, {
      market,
      userId,
      orders: [
        { side: "buy", quantity: 1n, price: 1n, tif: "gtc" },
        { side: "sell", quantity: 1n, price: 2n, tif: "gtc" },
      ],
    });
    expect(placed.slot).toBe(0);
    expect(pluginCall(placed.request).data).toBe(
      keeperCall(placed.request).data,
    );
    expect(() =>
      placeBatch(
        Array.from({ length: SLOT_COUNT }, () => 1n),
        {
          market,
          userId,
          orders: [{ side: "buy", quantity: 1n, price: 1n, tif: "gtc" }],
        },
      ),
    ).toThrow(/no free slot/);
  });

  it("cancels by slot only when the live order id still matches", () => {
    expect(() =>
      cancelSlot({
        market,
        userId,
        slotIdx: 4,
        liveOrderId: 0n,
        expectedOrderId: 11n,
      }),
    ).toThrow(/empty/);
    expect(() =>
      cancelSlot({
        market,
        userId,
        slotIdx: 4,
        liveOrderId: 12n,
        expectedOrderId: 11n,
      }),
    ).toThrow(/stale/);
    const request = cancelSlot({
      market,
      userId,
      slotIdx: 4,
      liveOrderId: 11n,
      expectedOrderId: 11n,
      clientOrderId,
    });
    expect(pluginCall(request).data).toBe(
      sdkData(
        buildCancelBySlotsRequest({
          market,
          userId,
          cancelSlotIdxs: [4],
          clientOrderId,
        }),
      ),
    );
  });
});

describe("account onboarding", () => {
  it("claims with the faucet selector and deposits through the SDK", () => {
    const claim = claimUsdcRequest(kuru.faucet);
    expect(pluginCall(claim).to).toBe(kuru.faucet);
    expect(pluginCall(claim).data).toBe("0x4e71d92d");

    const amount = 1_000_000_000n;
    const approve = approveAccountCoreRequest({
      token: kuru.usdc,
      accountCore: kuru.accountCore,
      amount,
    });
    expect(pluginCall(approve).to).toBe(kuru.usdc);

    const deposit = depositRequest({
      accountCore: kuru.accountCore,
      token: kuru.usdc,
      amount,
    });
    expect(pluginCall(deposit).to).toBe(kuru.accountCore);
    expect(pluginCall(deposit).data).toBe(
      sdkData(
        buildDepositFromAccount({
          accountCore: kuru.accountCore,
          token: kuru.usdc,
          amount,
        }),
      ),
    );

    const signer = "0x00000000000000000000000000000000000000a1" as const;
    const auth = {
      accountCore: kuru.accountCore,
      account: "0x00000000000000000000000000000000000000b2" as const,
      signer,
      permissions: 4,
      expiry: 1_800_000_000n,
    };
    expect(pluginCall(authorizeTradeSignerRequest(auth)).data).toBe(
      sdkData(buildAuthorizeAccountSignerRequest(auth)),
    );

    const plan = accountOnboardingCalls({
      faucet: kuru.faucet,
      token: kuru.usdc,
      accountCore: kuru.accountCore,
      user: auth.account,
      amount,
    });
    expect(plan.claim.data).toBe("0x4e71d92d");
    expect(plan.accountId.functionName).toBe("userRegistry");
    expect(plan.accountId.args).toEqual([auth.account]);
  });
});

describe("closure note book spec", () => {
  it("matches the listing request and is distinct from MON/USDC size", () => {
    expect(CN_BOOK_SPEC.pricePrecision).toBe(1_000_000);
    expect(CN_BOOK_SPEC.sizePrecision).toBe(1_000_000);
    expect(CN_BOOK_SPEC.tickSize).toBe(100);
    expect(CN_BOOK_SPEC.passiveSpreadTicks).toBe(50);
    expect(CN_BOOK_SPEC.minQuoteNotional).toBe(10_000_000n);
    expect(CN_BOOK_SPEC.takerFeePps).toBe(7000n);
    expect(CN_BOOK_SPEC.makerFeePps).toBe(4000n);
    expect(CN_BOOK_SPEC.sizePrecision).not.toBe(100_000_000);
  });
});

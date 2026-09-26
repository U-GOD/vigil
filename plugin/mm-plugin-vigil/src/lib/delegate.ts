import type { Address, Hex } from "viem";
import { authorizeSignerBySigRequest, pluginCall, tradeSignerTypedData } from "@vigil/sdk";
import { CHAIN_ID } from "./parse.js";

export function buildTradeDelegate(params: {
  accountCore: Address;
  account: Address;
  signer: Address;
  permissions: number;
  expiry: bigint;
  nonce: bigint;
  deadline: bigint;
}) {
  return tradeSignerTypedData({
    accountCore: params.accountCore,
    chainId: CHAIN_ID,
    account: params.account,
    authorizer: params.account,
    signer: params.signer,
    permissions: params.permissions,
    expiry: params.expiry,
    nonce: params.nonce,
    deadline: params.deadline,
  });
}

export function tradeDelegateCall(
  params: {
    accountCore: Address;
    account: Address;
    signer: Address;
    permissions: number;
    expiry: bigint;
    nonce: bigint;
    deadline: bigint;
    signature: Hex;
  },
) {
  return pluginCall(
    authorizeSignerBySigRequest({
      accountCore: params.accountCore,
      account: params.account,
      signer: params.signer,
      permissions: params.permissions,
      expiry: params.expiry,
      authorizer: params.account,
      nonce: params.nonce,
      deadline: params.deadline,
      signature: params.signature,
    }),
  );
}

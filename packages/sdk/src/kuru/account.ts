import type { Address } from "viem";
import {
  buildAuthorizeAccountSignerBySigRequest,
  buildAuthorizeAccountSignerRequest,
  buildAuthorizeAccountSignerTypedData,
  buildApproveErc20Request,
  buildDepositRequest,
  buildWithdrawRequest,
  type AuthorizeAccountSignerBySigParams,
  type AuthorizeAccountSignerParams,
  type AuthorizeAccountSignerTypedDataParams,
  type DepositParams,
  type WithdrawParams,
} from "@toxicflow-labs/ts-sdk/account";
import { accountCoreAbi } from "../abi.js";
import { encodeRequest, type EncodedCall, type RequestLike } from "./encode.js";

const faucetAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

const readAbi = accountCoreAbi;

export function claimUsdcRequest(faucet: Address): RequestLike {
  return {
    address: faucet,
    abi: faucetAbi,
    functionName: "claim",
  };
}

export function approveAccountCoreRequest(params: {
  token: Address;
  accountCore: Address;
  amount: bigint;
}): RequestLike {
  return approveTokenRequest({
    token: params.token,
    spender: params.accountCore,
    amount: params.amount,
  });
}

export function approveTokenRequest(params: {
  token: Address;
  spender: Address;
  amount: bigint;
}): RequestLike {
  return buildApproveErc20Request({
    token: params.token,
    spender: params.spender,
    amount: params.amount,
  });
}

export function depositRequest(
  params: DepositParams & { accountCore: Address },
): RequestLike {
  return buildDepositRequest(params);
}

export function withdrawRequest(
  params: WithdrawParams & { accountCore: Address },
): RequestLike {
  return buildWithdrawRequest(params);
}

export function authorizeTradeSignerRequest(
  params: AuthorizeAccountSignerParams & { accountCore: Address },
): RequestLike {
  return buildAuthorizeAccountSignerRequest(params);
}

/** EIP-712 payload for a signer. The caller supplies the permission bit. */
export function tradeSignerTypedData(params: AuthorizeAccountSignerTypedDataParams) {
  return buildAuthorizeAccountSignerTypedData(params);
}

export function authorizeSignerBySigRequest(
  params: AuthorizeAccountSignerBySigParams & { accountCore: Address },
): RequestLike {
  return buildAuthorizeAccountSignerBySigRequest(params);
}

export const accountPermissionAbi = [
  {
    type: "function",
    name: "ACCOUNT_PERMISSION_TRADE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "ACCOUNT_PERMISSION_WITHDRAW",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "accountSignerAuthorizationNonces",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function userRegistryRequest(accountCore: Address, user: Address): RequestLike {
  return {
    address: accountCore,
    abi: readAbi,
    functionName: "userRegistry",
    args: [user],
  };
}

export function balanceRequest(
  accountCore: Address,
  user: Address,
  token: Address,
): RequestLike {
  return {
    address: accountCore,
    abi: readAbi,
    functionName: "getBalance",
    args: [user, token],
  };
}

export function spotReservedRequest(
  accountCore: Address,
  user: Address,
  token: Address,
): RequestLike {
  return {
    address: accountCore,
    abi: readAbi,
    functionName: "getSpotReservedBalance",
    args: [user, token],
  };
}

export function signerAuthorizedRequest(
  accountCore: Address,
  account: Address,
  signer: Address,
  permission: number,
): RequestLike {
  return {
    address: accountCore,
    abi: readAbi,
    functionName: "isAuthorizedAccountSigner",
    args: [account, signer, permission],
  };
}

export type AccountOnboarding = {
  claim: EncodedCall;
  approve: EncodedCall;
  deposit: EncodedCall;
  accountId: RequestLike;
};

/** Faucet, approve, deposit. The account id is a follow-up read. */
export function accountOnboardingCalls(params: {
  faucet: Address;
  token: Address;
  accountCore: Address;
  user: Address;
  amount: bigint;
}): AccountOnboarding {
  return {
    claim: encodeRequest(claimUsdcRequest(params.faucet)),
    approve: encodeRequest(
      approveAccountCoreRequest({
        token: params.token,
        accountCore: params.accountCore,
        amount: params.amount,
      }),
    ),
    deposit: encodeRequest(
      depositRequest({
        accountCore: params.accountCore,
        token: params.token,
        amount: params.amount,
      }),
    ),
    accountId: userRegistryRequest(params.accountCore, params.user),
  };
}

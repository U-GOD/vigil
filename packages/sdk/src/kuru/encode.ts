import { encodeFunctionData, type Abi, type Address, type Hex } from "viem";

export type RequestLike = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

export type EncodedCall = {
  to: Address;
  data: Hex;
  value: bigint;
};

export function encodeRequest(request: RequestLike): EncodedCall {
  return {
    to: request.address,
    data: encodeFunctionData({
      abi: request.abi as Abi,
      functionName: request.functionName,
      args: request.args as never,
    }),
    value: request.value ?? 0n,
  };
}

/** Agent Wallet path. */
export function pluginCall(request: RequestLike): EncodedCall {
  return encodeRequest(request);
}

/** Keeper wallet-client path. Same bytes as `pluginCall`. */
export function keeperCall(request: RequestLike): EncodedCall {
  return encodeRequest(request);
}

"use client";

import { monadTestnet } from "@vigil/sdk/chain";
import type { Abi, Address } from "viem";
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from "wagmi";

export const CHAIN = monadTestnet;
const EXPLORER = monadTestnet.blockExplorers.default.url;

type Request = {
  address: Address;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

/** Every write targets chain 10143. Wagmi asks the wallet to switch first. */
export function useMonadWrite() {
  const account = useAccount();
  const write = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: write.data, chainId: CHAIN.id });

  function send(request: Request) {
    write.reset();
    write.writeContract({
      address: request.address,
      abi: request.abi as Abi,
      functionName: request.functionName,
      args: request.args,
      chainId: CHAIN.id,
    });
  }

  return {
    connected: account.address !== undefined,
    address: account.address,
    send,
    busy: write.isPending || (write.data !== undefined && receipt.isLoading),
    status: (
      <WriteStatus
        hash={write.data}
        error={write.error}
        pending={write.isPending}
        waiting={receipt.isLoading}
        outcome={receipt.data?.status}
        receiptError={receipt.error}
      />
    ),
  };
}

function WriteStatus({
  hash,
  error,
  pending,
  waiting,
  outcome,
  receiptError,
}: {
  hash: `0x${string}` | undefined;
  error: Error | null;
  pending: boolean;
  waiting: boolean;
  outcome: "success" | "reverted" | undefined;
  receiptError: Error | null;
}) {
  if (pending) return <p className="status">Confirm in the wallet.</p>;
  if (error) return <p className="status error">{shortError(error)}</p>;
  if (!hash) return null;
  const link = (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noreferrer">
      {hash.slice(0, 10)}…{hash.slice(-6)}
    </a>
  );
  if (waiting) return <p className="status">Submitted {link}. Waiting for the receipt.</p>;
  if (outcome === "success") return <p className="status ok">Confirmed {link}.</p>;
  if (outcome === "reverted") return <p className="status error">Reverted {link}.</p>;
  if (receiptError) return <p className="status error">{shortError(receiptError)}</p>;
  return <p className="status">Submitted {link}.</p>;
}

export function shortError(error: Error): string {
  const short = (error as { shortMessage?: string }).shortMessage;
  return short ?? error.message.split("\n")[0] ?? "The wallet returned an error.";
}

/** A non-negative integer in raw units, or null. */
export function parseRaw(value: FormDataEntryValue | null): bigint | null {
  const text = String(value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  return BigInt(text);
}

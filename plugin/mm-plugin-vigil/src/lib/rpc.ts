import { CHAIN_ID } from "./parse.js";

export const MONAD_RPC = "https://testnet-rpc.monad.xyz";

// Agent Wallet routes chain RPC through MetaMask's hosted proxy, which answers
// chain 10143 with 400 Invalid chainId. Gas estimation runs before approval,
// so a write dies there. Only the RPC endpoint moves; signing, policy, and MFA
// stay inside Agent Wallet.
const PROXY_PATH = `/infura-service/v1/${CHAIN_ID}/`;

export function isProxiedMonad(url: string): boolean {
  return url.includes(PROXY_PATH);
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

export function monadFetch(base: typeof fetch): typeof fetch {
  return async (input, init) => {
    if (!isProxiedMonad(requestUrl(input))) return base(input, init);
    const request = new Request(input, init);
    // Proxy auth headers are not forwarded to the public RPC.
    return base(MONAD_RPC, {
      method: request.method,
      headers: { "content-type": "application/json" },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      signal: request.signal,
    });
  };
}

export async function withMonadRpc<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = monadFetch(original);
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

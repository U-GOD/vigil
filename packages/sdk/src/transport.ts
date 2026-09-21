import { http, type HttpTransport } from "viem";

const DEFAULT_RPS = 20;

export type RateLimitedHttpOptions = {
  url?: string;
  rps?: number;
};

/// Token-bucket wrapper around viem `http`. Monad public RPC caps
/// `eth_call` at 25 rps; keepers should stay under that.
export function rateLimitedHttp(options: RateLimitedHttpOptions = {}): HttpTransport {
  const url = options.url ?? "https://testnet-rpc.monad.xyz";
  const rps = options.rps ?? DEFAULT_RPS;
  const inner = http(url);

  let available = rps;
  let lastRefill = Date.now();

  return ((opts) => {
    const transport = inner(opts);
    const request = transport.request.bind(transport);
    transport.request = (async (args) => {
      const now = Date.now();
      available = Math.min(rps, available + ((now - lastRefill) / 1000) * rps);
      lastRefill = now;
      if (available < 1) {
        const waitMs = ((1 - available) / rps) * 1000;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        available = 0;
      } else {
        available -= 1;
      }
      return request(args);
    }) as typeof transport.request;
    return transport;
  }) as HttpTransport;
}

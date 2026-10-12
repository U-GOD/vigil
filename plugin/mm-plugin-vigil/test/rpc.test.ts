import { afterEach, describe, expect, it, vi } from "vitest";
import { MONAD_RPC, isProxiedMonad, monadFetch, withMonadRpc } from "../src/lib/rpc.js";

const PROXY = "https://agentic-proxy.workers.cx.metamask.io/infura-service/v1";
const original = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = original;
});

describe("monad RPC redirect", () => {
  it("matches only the proxied 10143 endpoint", () => {
    expect(isProxiedMonad(`${PROXY}/10143/abc`)).toBe(true);
    expect(isProxiedMonad(`${PROXY}/1/abc`)).toBe(false);
    expect(isProxiedMonad(`${PROXY}/101430/abc`)).toBe(false);
    expect(isProxiedMonad(MONAD_RPC)).toBe(false);
  });

  it("sends the JSON-RPC body to Monad without proxy headers", async () => {
    const base = vi.fn(async () => new Response("{}"));
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_feeHistory", params: [] });
    await monadFetch(base as unknown as typeof fetch)(`${PROXY}/10143/key`, {
      method: "POST",
      headers: { authorization: "Bearer secret" },
      body,
    });
    expect(base).toHaveBeenCalledTimes(1);
    const [url, init] = base.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(MONAD_RPC);
    expect(init.body).toBe(body);
    expect(init.headers).toEqual({ "content-type": "application/json" });
  });

  it("passes other requests through untouched", async () => {
    const base = vi.fn(async () => new Response("{}"));
    const init = { method: "POST", body: "x" };
    await monadFetch(base as unknown as typeof fetch)(`${PROXY}/1/key`, init);
    expect(base).toHaveBeenCalledWith(`${PROXY}/1/key`, init);
  });

  it("restores fetch after the run, including on failure", async () => {
    await withMonadRpc(async () => {
      expect(globalThis.fetch).not.toBe(original);
    });
    expect(globalThis.fetch).toBe(original);
    await expect(
      withMonadRpc(async () => {
        throw new Error("gas");
      }),
    ).rejects.toThrow("gas");
    expect(globalThis.fetch).toBe(original);
  });
});

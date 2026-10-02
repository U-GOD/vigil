import { describe, expect, it } from "vitest";
import { createPublicClient } from "viem";
import { monadTestnet } from "../src/chain.js";
import { loadDeployments } from "../src/deployments.js";
import { rateLimitedHttp } from "../src/transport.js";

describe("deployments", () => {
  it("loads the Monad testnet address book", () => {
    const d = loadDeployments(10143);
    expect(d.chainId).toBe(10143);
    expect(d.kuru.accountCore).toBe("0x6384e9b2Bf3b65e1535403a0A543b5FDA905eE22");
    expect(d.kuru.spotRouter).toBe("0xba24a1042701f06e8F7edCF04389260D1Fa4c697");
    expect(d.pyth).toBe("0x2880aB155794e7179c9eE2e38200202908C17B43");
    expect(d.core.factory).toBe("0x24CCaE43cD194Ba893608F1a4d445749D25b435f");
    expect(d.core.policy).toBe("0xCf590C99C9FA28e3a220cA9CfC9b05C969140310");
    expect(d.core.underwriting).toBe("0x0818aBb914bEac562122335B1081D5EDac29c03F");
    expect(d.core.pythReporter).toBe("0x0CAe4391bAaeCb149F1e42E16800f07802edF823");
    expect(d.startBlock).toBe(66_840_976);
  });

  it("rejects an unknown chain", () => {
    expect(() => loadDeployments(1)).toThrow(/no deployments/);
  });
});

describe("chain", () => {
  it("defines Monad testnet as 10143", () => {
    expect(monadTestnet.id).toBe(10143);
    expect(monadTestnet.nativeCurrency.symbol).toBe("MON");
  });

  it("builds a public client with the rate-limited transport", () => {
    const client = createPublicClient({
      chain: monadTestnet,
      transport: rateLimitedHttp({ rps: 5 }),
    });
    expect(client.chain.id).toBe(10143);
  });
});

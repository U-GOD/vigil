"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { monadTestnet } from "@vigil/sdk/chain";
import { useState, type ReactNode } from "react";
import { injected } from "@wagmi/core";
import { WagmiProvider, createConfig, http } from "wagmi";

const config = createConfig({
  chains: [monadTestnet],
  connectors: [injected()],
  transports: { [monadTestnet.id]: http(monadTestnet.rpcUrls.default.http[0]) },
  ssr: true,
});

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

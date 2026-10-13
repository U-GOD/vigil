"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { shortId } from "@/lib/format";
import { CHAIN, shortError } from "@/lib/wallet";

const links = [
  { href: "/", label: "Session" },
  { href: "/market", label: "Market" },
  { href: "/position", label: "Position" },
  { href: "/settlement", label: "Settlement" },
  { href: "/surface", label: "Surface" },
  { href: "/docs", label: "Manual" },
];

function Wallet() {
  const [ready, setReady] = useState(false);
  const account = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const switchChain = useSwitchChain();
  useEffect(() => setReady(true), []);

  // The server render has no wallet. Hold the slot so the header does not jump.
  if (!ready || account.isReconnecting) {
    return (
      <div className="wallet">
        <button type="button" disabled>
          Wallet
        </button>
      </div>
    );
  }

  if (account.address) {
    const wrongChain = account.chainId !== CHAIN.id;
    return (
      <div className="wallet">
        {wrongChain ? (
          <button
            type="button"
            className="warn"
            disabled={switchChain.isPending}
            onClick={() => switchChain.switchChain({ chainId: CHAIN.id })}
          >
            {switchChain.isPending ? "Switching…" : `Switch to ${CHAIN.name}`}
          </button>
        ) : (
          <span className="address" title={account.address}>
            {shortId(account.address)}
          </span>
        )}
        <button type="button" onClick={() => disconnect.disconnect()}>
          Disconnect
        </button>
        {switchChain.error ? <p className="wallet-note error">{shortError(switchChain.error)}</p> : null}
      </div>
    );
  }

  // Prefer MetaMask, then any other announced wallet (EIP-6963), then the generic injected slot.
  // Announcement order follows extension load order, so the first announced wallet is not stable.
  const connectors = connect.connectors;
  const connector =
    connectors.find((item) => item.id === "io.metamask") ??
    connectors.find((item) => item.id !== "injected") ??
    connectors[0];
  const hasProvider = typeof window !== "undefined" && "ethereum" in window;
  if (!connector || (!hasProvider && connector.id === "injected")) {
    return (
      <div className="wallet">
        <a className="button" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
          Install a wallet
        </a>
      </div>
    );
  }
  return (
    <div className="wallet">
      <button
        type="button"
        disabled={connect.isPending}
        onClick={() => connect.connect({ connector, chainId: CHAIN.id })}
      >
        {connect.isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {connect.error ? <p className="wallet-note error">{shortError(connect.error)}</p> : null}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="page">
      <header>
        <div className="masthead">
          <div>
            <p className="mark">Vigil</p>
            <p className="dateline">Monad testnet, chain {CHAIN.id}</p>
          </div>
          <Wallet />
        </div>
        <nav>
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main>{children}</main>
      <footer>Figures come from the Vigil API. A write stays disabled until that response names a contract.</footer>
    </div>
  );
}

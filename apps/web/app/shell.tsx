"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { shortId } from "@/lib/format";

const links = [
  { href: "/", label: "Session" },
  { href: "/market", label: "Market" },
  { href: "/position", label: "Position" },
  { href: "/settlement", label: "Settlement" },
  { href: "/surface", label: "Surface" },
];

function Wallet() {
  const [ready, setReady] = useState(false);
  const account = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();
  useEffect(() => setReady(true), []);
  if (!ready) return <span className="wallet">Wallet</span>;
  if (account.address) {
    return (
      <span className="wallet">
        {shortId(account.address)}{" "}
        <button type="button" onClick={() => disconnect.disconnect()}>
          Disconnect
        </button>
      </span>
    );
  }
  const connector = connect.connectors[0];
  return (
    <span className="wallet">
      <button type="button" disabled={!connector} onClick={() => connector && connect.connect({ connector })}>
        Connect wallet
      </button>
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  return (
    <div className="page">
      <header>
        <Wallet />
        <p className="mark">Vigil</p>
        <p className="dateline">Monad testnet, chain 10143</p>
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

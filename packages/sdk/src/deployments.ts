import { isAddress, type Address } from "viem";
import raw10143 from "./deployments/10143.json" with { type: "json" };

export type KuruAddresses = {
  accountCore: Address;
  spotRouter: Address;
  usdc: Address;
  faucet: Address;
  monUsdc: Address;
};

export type NetworkDeployments = {
  chainId: number;
  ping: Address | null;
  kuru: KuruAddresses;
  pyth: Address;
};

const byChain: Record<number, NetworkDeployments> = {
  10143: parseDeployments(raw10143),
};

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`invalid address for ${label}: ${value}`);
  }
  return value;
}

function parseDeployments(raw: typeof raw10143): NetworkDeployments {
  return {
    chainId: raw.chainId,
    ping: raw.ping === null ? null : asAddress(raw.ping, "ping"),
    kuru: {
      accountCore: asAddress(raw.kuru.accountCore, "kuru.accountCore"),
      spotRouter: asAddress(raw.kuru.spotRouter, "kuru.spotRouter"),
      usdc: asAddress(raw.kuru.usdc, "kuru.usdc"),
      faucet: asAddress(raw.kuru.faucet, "kuru.faucet"),
      monUsdc: asAddress(raw.kuru.monUsdc, "kuru.monUsdc"),
    },
    pyth: asAddress(raw.pyth, "pyth"),
  };
}

export function loadDeployments(chainId: number): NetworkDeployments {
  const deployments = byChain[chainId];
  if (!deployments) {
    throw new Error(`no deployments for chain ${chainId}`);
  }
  return deployments;
}

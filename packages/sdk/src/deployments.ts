import { isAddress, type Address } from "viem";
import raw10143 from "./deployments/10143.json" with { type: "json" };

export type KuruAddresses = {
  accountCore: Address;
  spotRouter: Address;
  usdc: Address;
  faucet: Address;
  monUsdc: Address;
};

export type CoreAddresses = {
  sessions: Address | null;
  corpActions: Address | null;
  oracle: Address | null;
  settlement: Address | null;
  vault: Address | null;
  factory: Address | null;
  collateral: Address | null;
  listing: Address | null;
  policy: Address | null;
  underwriting: Address | null;
  pythReporter: Address | null;
};

export type NetworkDeployments = {
  chainId: number;
  startBlock: number | null;
  ping: Address | null;
  kuru: KuruAddresses;
  pyth: Address;
  core: CoreAddresses;
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
    startBlock: raw.startBlock,
    ping: raw.ping === null ? null : asAddress(raw.ping, "ping"),
    kuru: {
      accountCore: asAddress(raw.kuru.accountCore, "kuru.accountCore"),
      spotRouter: asAddress(raw.kuru.spotRouter, "kuru.spotRouter"),
      usdc: asAddress(raw.kuru.usdc, "kuru.usdc"),
      faucet: asAddress(raw.kuru.faucet, "kuru.faucet"),
      monUsdc: asAddress(raw.kuru.monUsdc, "kuru.monUsdc"),
    },
    pyth: asAddress(raw.pyth, "pyth"),
    core: {
      sessions: optionalAddress(raw.core.sessions, "core.sessions"),
      corpActions: optionalAddress(raw.core.corpActions, "core.corpActions"),
      oracle: optionalAddress(raw.core.oracle, "core.oracle"),
      settlement: optionalAddress(raw.core.settlement, "core.settlement"),
      vault: optionalAddress(raw.core.vault, "core.vault"),
      factory: optionalAddress(raw.core.factory, "core.factory"),
      collateral: optionalAddress(raw.core.collateral, "core.collateral"),
      listing: optionalAddress(raw.core.listing, "core.listing"),
      policy: optionalAddress(raw.core.policy, "core.policy"),
      underwriting: optionalAddress(raw.core.underwriting, "core.underwriting"),
      pythReporter: optionalAddress(raw.core.pythReporter, "core.pythReporter"),
    },
  };
}

function optionalAddress(value: string | null, label: string): Address | null {
  return value === null ? null : asAddress(value, label);
}

export function loadDeployments(chainId: number): NetworkDeployments {
  const deployments = byChain[chainId];
  if (!deployments) {
    throw new Error(`no deployments for chain ${chainId}`);
  }
  return deployments;
}

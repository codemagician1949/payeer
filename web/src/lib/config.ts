import { arc, arcTestnet, foundry } from "viem/chains";
import type { Address, Chain } from "viem";

type Network = "arc" | "arc-testnet" | "local";

const network = (process.env.NEXT_PUBLIC_NETWORK ?? "arc") as Network;

const chains: Record<Network, Chain> = {
  arc,
  // viem ships older *.arc.network RPCs for testnet; use the current ones from docs.arc.io.
  "arc-testnet": {
    ...arcTestnet,
    rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
    blockExplorers: { default: { name: "Arc Explorer", url: "https://explorer.testnet.arc.io" } },
  },
  local: { ...foundry, nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 } },
};

export const chain = chains[network];
export const isLocal = network === "local";

/** USDC ERC-20 interface on Arc: 6 decimals, same address on mainnet and testnet. */
export const USDC = (process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000") as Address;
export const USDC_DECIMALS = 6;

export const PAYEER = (process.env.NEXT_PUBLIC_PAYEER_ADDRESS ?? "0x") as Address;
export const PACTS = (process.env.NEXT_PUBLIC_PACTS_ADDRESS ?? "0x") as Address;

export const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function explorerTx(hash: string) {
  return `${chain.blockExplorers?.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string) {
  return `${chain.blockExplorers?.default.url}/address/${address}`;
}

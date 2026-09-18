"use client";

import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, arc, arcTestnet, base, mainnet, optimism } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit/networks";
import { cookieStorage, createStorage, http } from "wagmi";
import { chain, isLocal } from "./config";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

/** Arc first (that's where Payeer lives), then the chains people can bring USDC from. */
const arcNetwork: AppKitNetwork = chain.id === arcTestnet.id ? arcTestnet : arc;
export const networks: [AppKitNetwork, ...AppKitNetwork[]] = isLocal
  ? [arcNetwork]
  : [arcNetwork, base, arbitrum, optimism, mainnet];

export const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  transports: Object.fromEntries(networks.map((n) => [Number(n.id), http()])),
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

let started = false;

/** Reown's wallet modal: hundreds of wallets, WalletConnect QR for mobile, one modal for both. */
export function startAppKit() {
  if (started || !projectId) return;
  started = true;
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    defaultNetwork: arcNetwork,
    projectId,
    metadata: {
      name: "Payeer",
      description: "Get paid in USDC with a link, on Arc.",
      url: typeof window === "undefined" ? "https://payeer.app" : window.location.origin,
      icons: ["https://avatars.githubusercontent.com/u/179229932"],
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#8b7cff",
      "--w3m-border-radius-master": "3px",
    },
    features: { analytics: false, email: false, socials: false },
  });
}

export const appKitAvailable = !!projectId;

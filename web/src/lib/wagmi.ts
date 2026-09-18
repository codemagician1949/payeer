import { cookieStorage, createConfig, createStorage, http, injected } from "wagmi";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { chain, isLocal, WALLETCONNECT_PROJECT_ID } from "./config";
import { sources } from "./cctp";

export function makeWagmiConfig() {
  // Arc first, then the chains people can bring USDC from via CCTP.
  const fundingChains = isLocal ? [] : sources.map((s) => s.chain);
  return createConfig({
    chains: [chain, ...fundingChains] as const,
    connectors: [
      injected(),
      ...(WALLETCONNECT_PROJECT_ID
        ? [walletConnect({ projectId: WALLETCONNECT_PROJECT_ID, showQrModal: true })]
        : []),
    ],
    transports: Object.fromEntries([chain, ...fundingChains].map((c) => [c.id, http()])),
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof makeWagmiConfig>;
  }
}

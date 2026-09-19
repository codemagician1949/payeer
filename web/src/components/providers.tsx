"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider, type State } from "wagmi";
import { startAppKit, wagmiConfig } from "@/lib/appkit";
import { CircleProvider } from "./circle-provider";

// Reown's modal is created once, before React renders, so its web components are ready.
startAppKit();

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } } }),
  );

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <CircleProvider>
          {children}
          <Toaster
          position="top-center"
          toastOptions={{
            classNames: {
              toast: "!rounded-2xl !border-border !bg-surface !text-fg !shadow-xl",
              description: "!text-muted",
              actionButton: "!bg-accent !text-accent-fg !rounded-full",
            },
          }}
          />
        </CircleProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

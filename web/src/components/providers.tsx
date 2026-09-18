"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider, type State } from "wagmi";
import { makeWagmiConfig } from "@/lib/wagmi";

export function Providers({ children, initialState }: { children: ReactNode; initialState?: State }) {
  const [config] = useState(makeWagmiConfig);
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } } }),
  );

  return (
    <WagmiProvider config={config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
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
      </QueryClientProvider>
    </WagmiProvider>
  );
}

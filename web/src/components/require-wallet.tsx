"use client";

import { motion } from "motion/react";
import { Mail, ShieldCheck, Wallet, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "./connect";
import { useCircle } from "./circle-provider";
import { Card, Skeleton } from "./ui";

/**
 * Screens that create something on-chain ask for a wallet up front, so nobody fills in a form
 * only to hit a wall at the end.
 */
export function RequireWallet({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { isConnected } = useActiveAccount();
  const { isConnecting, isReconnecting } = useConnection();
  const circle = useCircle();

  const reassurances = [
    { icon: ShieldCheck, text: "Payeer never holds your money" },
    { icon: Zap, text: "Fees are about $0.003, paid in USDC" },
    circle.available
      ? { icon: Mail, text: "No wallet? Sign in with your email address" }
      : { icon: Wallet, text: "Hundreds of wallets, or scan a QR from your phone" },
  ];

  // wagmi restores the connection from a cookie, so `isConnected` is already true on the server.
  // Checking the reconnecting flags first would render a skeleton on the client while the server
  // rendered the form — a hydration mismatch that blanks the page until reconnect finishes.
  if (!isConnected && (isConnecting || isReconnecting)) {
    return (
      <div className="mx-auto max-w-md space-y-3">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-72 rounded-[var(--radius-card)]" />
      </div>
    );
  }

  if (isConnected) return <>{children}</>;

  return (
    <div className="mx-auto max-w-md pt-4 sm:pt-10">
      <Card className="text-center">
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="bg-brand mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl text-accent-fg"
        >
          <Wallet className="size-6" />
        </motion.span>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{body}</p>

        <div className="mt-6 flex justify-center">
          <ConnectButton size="lg" label="Connect to continue" />
        </div>

        {circle.wrongNetwork && process.env.NODE_ENV === "development" && (
          // Developer-facing only: users should never be told to run a command.
          <p className="mt-3 text-xs text-muted">
            Email sign-in is configured, but this Circle key covers a different network. Run{" "}
            <code className="font-mono text-fg">pnpm dev:testnet</code> to try it, or add a live key.
          </p>
        )}

        <ul className="mt-6 space-y-2 text-left">
          {reassurances.map((r) => (
            <li key={r.text} className="flex items-center gap-3 rounded-2xl bg-surface-2/60 px-4 py-2.5 text-sm text-muted">
              <r.icon className="size-4 shrink-0 text-accent" />
              {r.text}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

"use client";

import { motion } from "motion/react";
import { Mail, ShieldCheck, Wallet, Zap } from "lucide-react";
import type { ReactNode } from "react";
import { useConnection } from "wagmi";
import { ConnectButton } from "./connect";
import { Card, Skeleton } from "./ui";
import { useSignInOptions } from "@/hooks/use-signin-options";

/**
 * Screens that create something on-chain ask for a wallet up front, so nobody fills in a form
 * only to hit a wall at the end.
 */
export function RequireWallet({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { isConnected, isConnecting, isReconnecting } = useConnection();
  const signIn = useSignInOptions();

  const reassurances = [
    { icon: ShieldCheck, text: "Payeer never holds your money" },
    { icon: Zap, text: "Fees are about $0.003, paid in USDC" },
    signIn?.email
      ? { icon: Mail, text: "No wallet? Sign in with your email address" }
      : { icon: Wallet, text: "Hundreds of wallets, or scan a QR from your phone" },
  ];

  if (isConnecting || isReconnecting) {
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

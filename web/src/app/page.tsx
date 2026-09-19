"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Disc3, Handshake, Link2, Plus, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "@/components/connect";
import { FirstRun } from "@/components/first-run";
import { RequestRow } from "@/components/request-row";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import {
  Card as ShadCard,
  CardDescription as ShadCardDescription,
  CardHeader as ShadCardHeader,
  CardTitle as ShadCardTitle,
} from "@/components/shadcn/card";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { useMyRequests } from "@/hooks/use-payeer";
import { chain, isLocal } from "@/lib/config";
import { cn, formatUsdc } from "@/lib/format";

const actions = [
  { href: "/request", title: "Request", body: "Share a link, get paid", icon: Link2 },
  { href: "/spin", title: "Spin", body: "Who pays the bill?", icon: Disc3 },
  { href: "/pacts/new", title: "Pact", body: "Lock it in with friends", icon: Handshake },
];

export default function HomePage() {
  const { address, isConnected } = useActiveAccount();
  if (!isConnected || !address) return <Landing />;
  return <Dashboard address={address} />;
}

function Dashboard({ address }: { address: `0x${string}` }) {
  const { data: balance, isLoading } = useUsdcBalance();
  const requests = useMyRequests(address);

  return (
    <div className="space-y-8">
      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="pt-2 text-center sm:text-left">
        <p className="text-sm font-medium text-muted">Your balance</p>
        {isLoading ? (
          <Skeleton className="mx-auto mt-2 h-14 w-56 sm:mx-0" />
        ) : (
          <div className="mt-1 flex flex-col items-center gap-3 sm:flex-row sm:items-end">
            <p className="tabular text-5xl font-semibold tracking-tight sm:text-6xl">
              ${formatUsdc(balance)}
              <span className="ml-2 text-lg font-medium text-muted">USDC</span>
            </p>
            <Link
              href="/fund"
              className="mb-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-4 text-sm font-medium transition hover:border-accent/50"
            >
              <Plus className="size-4" /> Add money
            </Link>
          </div>
        )}
        {balance === 0n && (
          <p className="mt-3 text-sm text-muted">
            Nothing here yet.{" "}
            <Link href="/fund" className="text-accent hover:underline">
              Bring USDC from another network
            </Link>{" "}
            to get started.
          </p>
        )}
      </motion.section>

      <FirstRun />

      <section className="grid grid-cols-3 gap-3 sm:gap-4">
        {actions.map((a, i) => (
          <motion.div key={a.href} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i + 0.1 }}>
            <Link
              href={a.href}
              className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[0_20px_50px_-20px_var(--glow)] sm:p-6"
            >
              <span className="bg-brand mb-4 flex size-11 items-center justify-center rounded-2xl text-accent-fg sm:size-12">
                <a.icon className="size-5 sm:size-6" />
              </span>
              <span className="font-semibold sm:text-lg">{a.title}</span>
              <span className="mt-0.5 hidden text-sm text-muted sm:block">{a.body}</span>
              <ArrowUpRight className="absolute right-4 top-4 size-4 text-muted opacity-0 transition group-hover:opacity-100" />
            </Link>
          </motion.div>
        ))}
      </section>

      <Card className="p-2 sm:p-3">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <h2 className="font-semibold">Your requests</h2>
          <Link href="/activity" className="text-sm text-accent hover:underline">
            All activity
          </Link>
        </div>
        {requests.isLoading ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : requests.data?.length ? (
          <ul className="divide-y divide-border/60">
            {requests.data.slice(0, 6).map((r) => (
              <RequestRow key={r.id.toString()} request={r} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Link2 className="size-6" />}
            title="No requests yet"
            body="Create a payment link and share it anywhere. Whoever opens it can pay in one tap."
            action={
              <Link href="/request" className="bg-brand inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-accent-fg">
                Create a link
              </Link>
            }
          />
        )}
      </Card>
    </div>
  );
}

function Landing() {
  const isMainnet = !chain.testnet && !isLocal;
  const networkLabel = isMainnet ? "Live on Arc mainnet" : isLocal ? "Running on a local chain" : "Running on Arc testnet";

  return (
    <div className="flex flex-col items-center pt-4 text-center sm:pt-12">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted backdrop-blur"
      >
        <span className="relative flex size-1.5">
          <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-75", isMainnet ? "bg-success" : "bg-warn")} />
          <span className={cn("relative inline-flex size-1.5 rounded-full", isMainnet ? "bg-success" : "bg-warn")} />
        </span>
        {networkLabel}
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl"
      >
        Money between friends, <span className="text-gradient">sorted.</span>
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-5 max-w-xl text-lg text-muted"
      >
        Request USDC with a link, spin to decide who pays the bill, and lock stakes with friends. Fees are paid in USDC, so
        there&apos;s nothing else to buy.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="mt-8 flex flex-wrap justify-center gap-3"
      >
        <ConnectButton size="lg" label="Get started" />
        <Link
          href="/spin"
          className="inline-flex h-14 items-center rounded-full border border-border bg-surface/80 px-7 font-medium backdrop-blur transition hover:border-accent/40 hover:bg-surface-2"
        >
          Try the spinner
        </Link>
      </motion.div>

      <motion.dl
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="mt-10 grid w-full max-w-lg grid-cols-3 gap-px overflow-hidden rounded-2xl border border-border bg-border/60"
      >
        {[
          { value: "~$0.003", label: "per payment" },
          { value: "<1s", label: "to settle" },
          { value: "0", label: "extra tokens" },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface/80 px-4 py-4 backdrop-blur">
            <dt className="tabular text-xl font-semibold sm:text-2xl">{stat.value}</dt>
            <dd className="mt-0.5 text-xs text-muted">{stat.label}</dd>
          </div>
        ))}
      </motion.dl>

      <div className="mt-14 grid w-full gap-4 text-left sm:grid-cols-3">
        {[
          { icon: Link2, title: "Pay links", body: "Fixed or open amounts, expiry, one-tap checkout and QR codes.", href: "/request" },
          { icon: Disc3, title: "Bill spinner", body: "Everyone scans in, one wheel, same result on every phone.", href: "/spin" },
          { icon: Handshake, title: "Pacts", body: "Group escrow that pays out when everyone agrees, or when the result is checked.", href: "/pacts" },
        ].map((f, i) => (
          <motion.div key={f.title} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.06 }}>
            <Link href={f.href} className="group block h-full">
              <ShadCard className="halo relative h-full overflow-hidden rounded-[var(--radius-card)] border-border bg-surface/80 backdrop-blur transition group-hover:-translate-y-1 group-hover:border-accent/40">
                <ShadCardHeader>
                  <span className="mb-2 flex size-11 items-center justify-center rounded-2xl bg-accent/12 text-accent transition group-hover:bg-accent group-hover:text-accent-fg">
                    <f.icon className="size-5" />
                  </span>
                  <ShadCardTitle className="text-base">{f.title}</ShadCardTitle>
                  <ShadCardDescription className="text-sm text-muted">{f.body}</ShadCardDescription>
                </ShadCardHeader>
              </ShadCard>
            </Link>
          </motion.div>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted">
        <span className="inline-flex items-center gap-2">
          <Zap className="size-4 text-accent" /> Sub-second settlement
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-4 text-accent" /> Non-custodial
        </span>
        <span className="inline-flex items-center gap-2">
          <Sparkles className="size-4 text-accent" /> Fees in dollars
        </span>
      </div>
    </div>
  );
}

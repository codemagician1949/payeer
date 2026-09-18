"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowUpRight, Disc3, Handshake, Link2, Plus, Sparkles, Zap, ShieldCheck } from "lucide-react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@/components/connect";
import { FirstRun } from "@/components/first-run";
import { RequestRow } from "@/components/request-row";
import { Card, EmptyState, Skeleton } from "@/components/ui";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { useMyRequests } from "@/hooks/use-payeer";
import { formatUsdc } from "@/lib/format";

const actions = [
  { href: "/request", title: "Request", body: "Share a link, get paid", icon: Link2 },
  { href: "/spin", title: "Spin", body: "Who pays the bill?", icon: Disc3 },
  { href: "/pacts/new", title: "Pact", body: "Lock it in with friends", icon: Handshake },
];

export default function HomePage() {
  const { address, isConnected } = useConnection();
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
  return (
    <div className="flex flex-col items-center pt-6 text-center sm:pt-16">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3 py-1.5 text-xs font-medium text-muted">
        <span className="size-1.5 rounded-full bg-success" /> Live on Arc
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl"
      >
        Money between friends, <span className="text-gradient">sorted.</span>
      </motion.h1>
      <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-5 max-w-xl text-lg text-muted">
        Request USDC with a link, spin to decide who pays the bill, and lock stakes with friends. Fees are paid in USDC, so there&apos;s nothing else to buy.
      </motion.p>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 flex flex-wrap justify-center gap-3">
        <ConnectButton size="lg" label="Get started" />
        <Link href="/spin" className="inline-flex h-14 items-center rounded-full border border-border bg-surface px-7 font-medium transition hover:bg-surface-2">
          Try the spinner
        </Link>
      </motion.div>

      <div className="mt-16 grid w-full gap-4 text-left sm:grid-cols-3">
        {[
          { icon: Link2, title: "Pay links", body: "Fixed or open amounts, expiry, one-tap checkout and QR codes." },
          { icon: Disc3, title: "Bill spinner", body: "Add names, spin, and the loser gets a payment link instantly." },
          { icon: Handshake, title: "Pacts", body: "Group escrow that pays out when everyone agrees, or when the AI checks the result." },
        ].map((f, i) => (
          <Card key={f.title} transition={{ delay: 0.2 + i * 0.05 }}>
            <f.icon className="mb-4 size-6 text-accent" />
            <p className="font-semibold">{f.title}</p>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </Card>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-muted">
        <span className="inline-flex items-center gap-2"><Zap className="size-4 text-accent" /> Sub-second settlement</span>
        <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-accent" /> Non-custodial</span>
        <span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" /> Fees in dollars</span>
      </div>
    </div>
  );
}

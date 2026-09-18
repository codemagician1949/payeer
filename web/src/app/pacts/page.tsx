"use client";

import Link from "next/link";
import { Bot, ChevronRight, Handshake, Plus } from "lucide-react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@/components/connect";
import { StageBadge } from "@/components/pact-bits";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { useMyPacts } from "@/hooks/use-pacts";
import { formatUsdc } from "@/lib/format";

export default function PactsPage() {
  const { address, isConnected } = useConnection();
  const { data, isLoading } = useMyPacts(address);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Pacts"
        subtitle="Lock USDC with friends. It pays out when the result is in, or everyone gets refunded."
        action={
          isConnected && (
            <Link href="/pacts/new" className="bg-brand inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-accent-fg">
              <Plus className="size-4" /> New
            </Link>
          )
        }
      />

      {!isConnected ? (
        <Card>
          <EmptyState
            icon={<Handshake className="size-6" />}
            title="Connect to see your pacts"
            body="Create a pact, share the link, and everyone stakes the same amount on the outcome they believe in."
            action={<ConnectButton size="md" />}
          />
        </Card>
      ) : isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 rounded-3xl" />
          ))}
        </div>
      ) : !data?.length ? (
        <Card>
          <EmptyState
            icon={<Handshake className="size-6" />}
            title="No pacts yet"
            body="Predicting a match, a fitness challenge, a deposit between friends: set the terms, share the link, and let the contract hold the money."
            action={
              <Link href="/pacts/new" className="bg-brand inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-accent-fg">
                Create a pact
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((p) => (
            <li key={p.id.toString()}>
              <Link href={`/pacts/${p.id}`} className="block">
                <Card className="flex items-center gap-4 transition hover:border-accent/40">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StageBadge stage={p.stage} />
                      {p.aiResolved && (
                        <Badge>
                          <Bot className="size-3" /> AI checked
                        </Badge>
                      )}
                      {p.claimable > 0n && <Badge tone="success">${formatUsdc(p.claimable)} to claim</Badge>}
                    </div>
                    <p className="truncate font-semibold">{p.terms}</p>
                    <p className="mt-0.5 truncate text-sm text-muted">{p.options.join(" · ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-lg font-semibold">${formatUsdc(p.pot, { compact: true })}</p>
                    <p className="text-xs text-muted">{p.participantCount}/{p.maxParticipants} in</p>
                  </div>
                  <ChevronRight className="size-4 text-muted" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

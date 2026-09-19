"use client";

import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Activity as ActivityIcon, Users } from "lucide-react";
import { useState } from "react";
import { useReadContract } from "wagmi";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "@/components/connect";
import { RequestRow } from "@/components/request-row";
import { Avatar, Button, Card, EmptyState, PageHeader, Segmented, Skeleton } from "@/components/ui";
import { useMyRequests } from "@/hooks/use-payeer";
import { payeerAbi } from "@/lib/abi";
import { explorerAddress, PAYEER } from "@/lib/config";
import { cn, formatUsdc, relativeTime, shortAddress } from "@/lib/format";

const PAGE = 25;

// Matches the contract's Kind enum.
const kinds = {
  1: { label: "Sent", incoming: false },
  2: { label: "Received", incoming: true },
  3: { label: "Paid request", incoming: false },
  4: { label: "Request paid", incoming: true },
  5: { label: "Batch payout", incoming: false },
} as const;

export default function ActivityPage() {
  const { address, isConnected } = useActiveAccount();
  const [tab, setTab] = useState<"all" | "requests">("all");
  const [limit, setLimit] = useState(PAGE);

  const feed = useReadContract({
    address: PAYEER,
    abi: payeerAbi,
    functionName: "feed",
    args: address ? [address, 0n, BigInt(limit)] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const requests = useMyRequests(address);

  if (!isConnected) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Activity" />
        <Card>
          <EmptyState icon={<ActivityIcon className="size-6" />} title="Connect your wallet" body="Your payments on Arc appear here, with a link to each receipt." action={<ConnectButton size="md" />} />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Activity" subtitle="Every payment, settled on Arc." />
      <div className="mb-4 max-w-xs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: "all", label: "Payments" },
            { value: "requests", label: "My requests" },
          ]}
        />
      </div>

      <Card className="p-2 sm:p-3">
        {tab === "all" ? (
          feed.isLoading ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : feed.data?.length ? (
            <>
              <ul className="divide-y divide-border/60">
                {feed.data.map((e, i) => {
                  const kind = kinds[e.kind as keyof typeof kinds];
                  if (!kind) return null;
                  const isBatch = e.kind === 5;
                  return (
                    <li key={`${e.at}-${i}`} className="flex items-center gap-3 px-2 py-3">
                      {isBatch ? (
                        <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-muted">
                          <Users className="size-5" />
                        </span>
                      ) : (
                        <Avatar seed={e.counterparty} size={40} />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">
                          {isBatch ? `Paid ${e.ref} people` : kind.label}
                          {e.ref > 0 && !isBatch && (
                            <Link href={`/pay/${e.ref}`} className="ml-2 text-xs text-accent hover:underline">
                              #{e.ref}
                            </Link>
                          )}
                        </p>
                        <p className="text-xs text-muted">
                          {!isBatch && (
                            <a href={explorerAddress(e.counterparty)} target="_blank" rel="noreferrer" className="tabular hover:text-fg">
                              {kind.incoming ? "from" : "to"} {shortAddress(e.counterparty)}
                            </a>
                          )}
                          {!isBatch && " · "}
                          {relativeTime(e.at)}
                        </p>
                      </div>
                      <p className={cn("tabular flex items-center gap-1 font-semibold", kind.incoming ? "text-success" : "text-fg")}>
                        {kind.incoming ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4 text-muted" />}
                        {kind.incoming ? "+" : "−"}${formatUsdc(e.amount)}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {feed.data.length >= limit && (
                <div className="p-3">
                  <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>
                    Show more
                  </Button>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={<ActivityIcon className="size-6" />}
              title="Nothing yet"
              body="Once you send or receive USDC through Payeer, it shows up here."
              action={
                <Link href="/request" className="bg-brand inline-flex h-10 items-center rounded-full px-5 text-sm font-medium text-accent-fg">
                  Request money
                </Link>
              }
            />
          )
        ) : requests.isLoading ? (
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : requests.data?.length ? (
          <ul className="divide-y divide-border/60">
            {requests.data.map((r) => (
              <RequestRow key={r.id.toString()} request={r} />
            ))}
          </ul>
        ) : (
          <EmptyState icon={<ActivityIcon className="size-6" />} title="No requests yet" body="Payment links you create will be listed here with their status." />
        )}
      </Card>

      <p className="mt-6 text-center text-sm text-muted">
        Paying several people at once?{" "}
        <Link href="/batch" className="text-accent hover:underline">
          Batch payout
        </Link>
      </p>
    </div>
  );
}

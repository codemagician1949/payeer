"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PaymentRequest } from "@/hooks/use-payeer";
import { formatUsdc } from "@/lib/format";
import { Badge } from "./ui";

const tone = { open: "accent", paid: "success", cancelled: "neutral", expired: "warn", missing: "neutral" } as const;

export function RequestRow({ request: r }: { request: PaymentRequest }) {
  return (
    <li>
      <Link href={`/pay/${r.id}`} className="flex items-center gap-3 rounded-2xl px-3 py-3 transition hover:bg-surface-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{r.memo || `Request #${r.id}`}</p>
          <p className="text-xs text-muted">
            {r.reusable ? `${r.payments} payment${r.payments === 1 ? "" : "s"} · $${formatUsdc(r.totalReceived)} received` : `#${r.id}`}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-semibold">{r.amount === 0n ? "Any amount" : `$${formatUsdc(r.amount)}`}</p>
          <Badge tone={tone[r.status]}>{r.status}</Badge>
        </div>
        <ChevronRight className="size-4 text-muted" />
      </Link>
    </li>
  );
}

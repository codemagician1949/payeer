"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { Bell, PartyPopper } from "lucide-react";
import { useSettlements } from "@/hooks/use-settlements";
import { formatUsdc } from "@/lib/format";

/**
 * A strip under the header when a pact has finished and left money behind. It stays until the
 * money is claimed, because it isn't an announcement — it's an unfinished task.
 */
export function SettleBanner() {
  const { waiting, total } = useSettlements();
  const one = waiting.length === 1 ? waiting[0] : undefined;

  return (
    <AnimatePresence>
      {waiting.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="overflow-hidden border-b border-success/25 bg-success/10"
        >
          <Link
            href={one ? `/pacts/${one.id}` : "/pacts"}
            className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 text-sm"
          >
            <PartyPopper className="size-4 shrink-0 text-success" />
            <p className="min-w-0 flex-1 truncate">
              {one ? (
                <>
                  <span className="font-medium">{one.refunded ? "Refunded:" : "You won:"}</span> {one.terms}
                </>
              ) : (
                <span className="font-medium">{waiting.length} pacts have money waiting for you</span>
              )}
            </p>
            <span className="tabular shrink-0 font-semibold text-success">${formatUsdc(total)}</span>
            <span className="shrink-0 rounded-full bg-success/20 px-3 py-1 text-xs font-medium text-success">Claim</span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Offered on a pact that hasn't finished yet — the one moment where "tell me when this is done"
 * is a thing someone actually wants. Asking on page load would just get refused.
 */
export function NotifyWhenSettled() {
  const { permission, ask } = useSettlements();
  if (permission === "unsupported" || permission === "denied") return null;

  if (permission === "granted") {
    return (
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted">
        <Bell className="size-3.5" /> You&apos;ll be notified when this settles.
      </p>
    );
  }

  return (
    <button
      onClick={ask}
      className="mx-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-surface-2 hover:text-fg"
    >
      <Bell className="size-3.5" /> Notify me when this settles
    </button>
  );
}

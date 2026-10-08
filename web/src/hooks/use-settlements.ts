"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useActiveAccount } from "./use-account";
import { useMyPacts } from "./use-pacts";
import { formatUsdc } from "@/lib/format";

export type Settlement = {
  id: bigint;
  terms: string;
  amount: bigint;
  /** A refund rather than winnings: the pact ended without a result. */
  refunded: boolean;
};

export type NotifyState = "unsupported" | "default" | "granted" | "denied";

/**
 * Pacts that have finished and left money for this account to collect.
 *
 * A pact can settle with nobody watching — the AI proposes a result, the objection window runs
 * out, and anyone at all can finalize it — so the winner has no way of knowing unless something
 * tells them. This reads the same list the Pacts page reads (wagmi shares the query, so it costs
 * no extra RPC calls) and surfaces anything claimable as a banner and a nav badge. If the browser
 * has been given permission, it also raises a real notification, which arrives while Payeer is
 * sitting in a background tab.
 *
 * Notifications only fire for pacts that settle *while the app is open*. Whatever was already
 * waiting when the page loaded is shown in the banner instead, rather than firing a pile of
 * notifications about results from last week.
 */
export function useSettlements() {
  const { address } = useActiveAccount();
  const { data } = useMyPacts(address);
  const [permission, setPermission] = useState<NotifyState>("unsupported");
  /** Pact ids already announced, per account. Null until the first list arrives. */
  const announced = useRef<Set<string> | null>(null);

  // The server can't know what the browser allows, so this is read after mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof window !== "undefined" && "Notification" in window) setPermission(Notification.permission);
  }, []);

  // Reset between accounts: what the previous one had seen says nothing about this one.
  useEffect(() => {
    announced.current = null;
  }, [address]);

  const waiting = useMemo<Settlement[]>(
    () =>
      (data ?? [])
        .filter((p) => p.claimable > 0n)
        .map((p) => ({ id: p.id, terms: p.terms, amount: p.claimable, refunded: p.stage === "refunded" })),
    [data],
  );

  useEffect(() => {
    if (!address || !data) return;

    // The first list is the baseline, not news.
    if (!announced.current) {
      announced.current = new Set(waiting.map((w) => w.id.toString()));
      return;
    }

    const fresh = waiting.filter((w) => !announced.current!.has(w.id.toString()));
    if (fresh.length === 0) return;
    for (const w of fresh) announced.current.add(w.id.toString());

    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const w of fresh.slice(0, 3)) {
      try {
        new Notification(w.refunded ? "Pact refunded" : "You won a pact", {
          body: `${w.terms} — $${formatUsdc(w.amount)} is yours to claim.`,
          icon: "/payeer-192.png",
          tag: `payeer-pact-${w.id}`, // replaces rather than stacks if it fires twice
        });
      } catch {
        // Some browsers only allow notifications from a service worker; the banner still shows.
      }
    }
  }, [waiting, address, data]);

  const ask = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {}
  }, []);

  const total = waiting.reduce((sum, w) => sum + w.amount, 0n);
  return { waiting, total, permission, ask };
}

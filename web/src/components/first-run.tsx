"use client";

import { AnimatePresence, motion } from "motion/react";
import { Link2, Wallet, X, Zap } from "lucide-react";
import { useEffect, useState } from "react";

const KEY = "payeer:first-run-dismissed";

const points = [
  { icon: Wallet, title: "Your money stays yours", body: "Payeer never holds it. Payments go straight from your wallet to theirs." },
  { icon: Zap, title: "Fees are in dollars", body: "About $0.003 per payment, paid in USDC. There's no second token to buy." },
  { icon: Link2, title: "Share a link, get paid", body: "Anyone can pay it in one tap, even if this is their first time." },
];

/** A short explainer for people who have just connected for the first time. */
export function FirstRun() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {}
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setShow(false);
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.section
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden"
        >
          <div className="relative rounded-[var(--radius-card)] border border-accent/30 bg-accent/[0.06] p-5 sm:p-6">
            <button onClick={dismiss} className="absolute right-3 top-3 rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Dismiss">
              <X className="size-4" />
            </button>
            <p className="font-semibold">New here? Three things worth knowing.</p>
            <ul className="mt-4 grid gap-4 sm:grid-cols-3">
              {points.map((p) => (
                <li key={p.title} className="flex gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
                    <p.icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-medium">{p.title}</span>
                    <span className="block text-sm text-muted">{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

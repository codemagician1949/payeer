"use client";

import { Mail } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useCircle } from "./circle-provider";
import { Sheet } from "./sheet";
import { Button, Input } from "./ui";

/**
 * Email sign-in, handled end to end by Circle: they send the code, verify it, and hold the
 * key shares for the wallet. Payeer never sees a private key.
 */
export function CircleSignIn({ size = "lg" }: { size?: "sm" | "md" | "lg" }) {
  const circle = useCircle();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");

  if (!circle.available || circle.session) return null;

  async function signIn() {
    try {
      await circle.signIn(email.trim());
      toast.success("You're in. Your Arc wallet is ready.");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign you in.");
    }
  }

  return (
    <>
      <Button variant="secondary" size={size} onClick={() => setOpen(true)}>
        <Mail className="size-4" /> Continue with email
      </Button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Sign in with email">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Circle sends you a code and looks after your wallet keys. No app to install, and nothing to write down.
          </p>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              signIn();
            }}
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              autoComplete="email"
            />
            <Button size="lg" type="submit" loading={circle.busy} disabled={!email.includes("@")}>
              {circle.busy ? "Check your email…" : "Send me a code"}
            </Button>
          </form>
          <p className="text-center text-xs text-muted">
            You&apos;ll choose a PIN to approve payments. Wallets and keys are managed by Circle, the company behind USDC.
          </p>
        </div>
      </Sheet>
    </>
  );
}

/** Small account chip for a Circle session, mirroring the wallet one. */
export function CircleAccount() {
  const circle = useCircle();
  if (!circle.session) return null;
  return (
    <button
      onClick={() => circle.signOut()}
      className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-3 pr-3 text-sm font-medium transition hover:bg-surface-2"
      title="Sign out"
    >
      <Mail className="size-3.5 text-accent" />
      <span className="tabular">{`${circle.session.address.slice(0, 6)}…${circle.session.address.slice(-4)}`}</span>
    </button>
  );
}

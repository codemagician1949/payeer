"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Users } from "lucide-react";
import { useState } from "react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@/components/connect";
import { ShareLink } from "@/components/share-link";
import { AmountInput, Button, Card, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { useTx } from "@/hooks/use-tx";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { payUrl, requestIdFrom } from "@/lib/requests";

type Kind = "fixed" | "open";
type Expiry = "never" | "1d" | "7d" | "30d";
const expirySeconds: Record<Expiry, number> = { never: 0, "1d": 86400, "7d": 604800, "30d": 2592000 };

export default function RequestPage() {
  const { isConnected } = useConnection();
  const tx = useTx();
  const [kind, setKind] = useState<Kind>("fixed");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [expiry, setExpiry] = useState<Expiry>("7d");
  const [multi, setMulti] = useState(false);
  const [created, setCreated] = useState<{ id: bigint; amount?: bigint; memo: string }>();

  const parsed = parseUsdc(amount);
  const valid = kind === "open" || parsed !== undefined;

  async function create() {
    const expiresAt = expirySeconds[expiry] ? Math.floor(Date.now() / 1000) + expirySeconds[expiry] : 0;
    const value = kind === "fixed" ? parsed! : 0n;
    const receipt = await tx.send(
      {
        address: PAYEER,
        abi: payeerAbi,
        functionName: "createRequest",
        args: [value, expiresAt, kind === "open" || multi, memo.trim()],
      },
      { pending: "Creating your link…", success: "Payment link ready" },
    );
    setCreated({ id: requestIdFrom(receipt), amount: kind === "fixed" ? value : undefined, memo: memo.trim() });
  }

  if (created) {
    const url = payUrl(created.id);
    return (
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 300, damping: 18 }}>
            <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          </motion.div>
          <h1 className="text-2xl font-semibold">Link ready</h1>
          <p className="mb-6 mt-1 text-muted">
            {created.amount ? `$${formatUsdc(created.amount)}` : "Any amount"}
            {created.memo && ` · ${created.memo}`}
          </p>
          <ShareLink url={url} title="Payeer request" text={`Pay me${created.amount ? ` $${formatUsdc(created.amount)}` : ""} on Payeer${created.memo ? ` for ${created.memo}` : ""}`} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={`/pay/${created.id}`} className="flex h-11 items-center justify-center rounded-full bg-surface-2 text-sm font-medium">
              Open link
            </Link>
            <Button variant="secondary" onClick={() => { setCreated(undefined); setAmount(""); setMemo(""); tx.reset(); }}>
              New request
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Request money" subtitle="Create a link anyone can pay in one tap." />
      <Card className="space-y-6">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "fixed", label: "Fixed amount" },
            { value: "open", label: "Payer chooses" },
          ]}
        />

        <AnimatePresence mode="wait" initial={false}>
          {kind === "fixed" ? (
            <motion.div key="fixed" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <AmountInput value={amount} onChange={setAmount} autoFocus />
            </motion.div>
          ) : (
            <motion.p key="open" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="py-3 text-center text-sm text-muted">
              Great for tips, donations and checkout links. The link stays open for multiple payments.
            </motion.p>
          )}
        </AnimatePresence>

        <Field label="What's it for?" hint={`${memo.length}/280`}>
          <Input value={memo} maxLength={280} onChange={(e) => setMemo(e.target.value)} placeholder="Design work, dinner, rent…" />
        </Field>

        <Field label="Expires">
          <Segmented
            value={expiry}
            onChange={setExpiry}
            options={[
              { value: "1d", label: "1 day" },
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "never", label: "Never" },
            ]}
          />
        </Field>

        {kind === "fixed" && (
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-surface-2/60 p-4">
            <Users className="size-5 text-muted" />
            <span className="flex-1 text-sm">
              <span className="block font-medium">Let several people pay</span>
              <span className="text-muted">Each person pays the amount, e.g. splitting a bill.</span>
            </span>
            <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="size-5 accent-[var(--accent)]" />
          </label>
        )}

        {isConnected ? (
          <Button size="lg" disabled={!valid} loading={tx.busy} onClick={() => create().catch(() => {})}>
            {tx.step === "confirming" ? "Creating…" : "Create link"}
          </Button>
        ) : (
          <div className="flex justify-center">
            <ConnectButton size="lg" label="Connect to create" />
          </div>
        )}
      </Card>
    </div>
  );
}

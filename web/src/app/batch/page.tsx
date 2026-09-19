"use client";

import { CheckCircle2, Upload, Users } from "lucide-react";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "@/components/connect";
import { Avatar, Button, Card, Field, Input, PageHeader } from "@/components/ui";
import { useTx } from "@/hooks/use-tx";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { formatUsdc, parseUsdc, shortAddress } from "@/lib/format";

const MAX_ROWS = 50;

type Row = { address: Address; amount: bigint; raw: string };

/** Accepts "0xabc…,12.50" or "0xabc… 12.50", one per line. */
function parseRows(text: string) {
  const rows: Row[] = [];
  const errors: string[] = [];
  for (const [i, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [addr, amountRaw] = trimmed.split(/[,\s]+/);
    const amount = parseUsdc(amountRaw ?? "");
    if (!isAddress(addr ?? "")) errors.push(`Line ${i + 1}: not a valid address`);
    else if (!amount) errors.push(`Line ${i + 1}: check the amount`);
    else rows.push({ address: addr as Address, amount, raw: trimmed });
  }
  if (rows.length > MAX_ROWS) errors.push(`Up to ${MAX_ROWS} recipients per batch.`);
  return { rows, errors };
}

export default function BatchPage() {
  const { isConnected } = useActiveAccount();
  const { data: balance } = useUsdcBalance();
  const tx = useTx();
  const [text, setText] = useState("");
  const [memo, setMemo] = useState("");
  const [done, setDone] = useState<{ count: number; total: bigint }>();

  const { rows, errors } = parseRows(text);
  const total = rows.reduce((sum, r) => sum + r.amount, 0n);
  const insufficient = balance !== undefined && balance < total;

  async function pay() {
    await tx.send(
      {
        address: PAYEER,
        abi: payeerAbi,
        functionName: "batchPay",
        args: [rows.map((r) => r.address), rows.map((r) => r.amount), memo.trim()],
      },
      { spend: total, pending: `Paying ${rows.length} people…`, success: `Sent $${formatUsdc(total)}` },
    );
    setDone({ count: rows.length, total });
    celebrate();
    setText("");
    tx.reset();
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          <h1 className="text-2xl font-semibold">Payout sent</h1>
          <p className="mt-1 text-muted">
            ${formatUsdc(done.total)} to {done.count} {done.count === 1 ? "person" : "people"}, in one transaction.
          </p>
          <Button className="mt-6 w-full" variant="secondary" onClick={() => setDone(undefined)}>
            New payout
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Batch payout" subtitle="Pay a whole team, bounty list or payroll run in a single transaction." />
      <Card className="space-y-5">
        <Field label="Recipients" hint="One per line: wallet address, then amount. Commas or spaces both work.">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={"0x1234…abcd, 250\n0x9876…4321, 125.50"}
            className="w-full rounded-2xl border border-border bg-surface-2/60 px-4 py-3 font-mono text-sm outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15"
          />
        </Field>

        <Field label="Note (optional)">
          <Input value={memo} maxLength={280} onChange={(e) => setMemo(e.target.value)} placeholder="October payroll" />
        </Field>

        {rows.length > 0 && (
          <div className="rounded-2xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-muted" /> {rows.length} recipient{rows.length === 1 ? "" : "s"}
              </span>
              <span className="tabular font-semibold">${formatUsdc(total)}</span>
            </div>
            <ul className="max-h-52 divide-y divide-border/60 overflow-y-auto">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar seed={r.address} size={28} />
                  <span className="tabular flex-1 text-sm">{shortAddress(r.address)}</span>
                  <span className="tabular text-sm font-medium">${formatUsdc(r.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-2xl bg-danger/10 p-4 text-sm text-danger">
            {errors.slice(0, 4).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        {isConnected ? (
          <div className="space-y-2">
            <Button size="lg" disabled={!rows.length || errors.length > 0 || insufficient} loading={tx.busy} onClick={() => pay().catch(() => {})}>
              {tx.step === "approving" ? "Approving USDC…" : `Pay $${formatUsdc(total)}`}
            </Button>
            {insufficient && <p className="text-center text-xs text-muted">You have ${formatUsdc(balance)} USDC.</p>}
          </div>
        ) : (
          <div className="flex justify-center">
            <ConnectButton size="lg" label="Connect to pay" />
          </div>
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2 px-2 text-xs text-muted">
        <Upload className="mt-0.5 size-3.5 shrink-0" />
        Paste straight from a spreadsheet: copy the address and amount columns and drop them in.
      </div>
    </div>
  );
}

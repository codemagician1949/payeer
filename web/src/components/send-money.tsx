"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";
import { isAddress, type Address } from "viem";
import { Avatar, Button, Input } from "./ui";
import { useTx } from "@/hooks/use-tx";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { formatUsdc, shortAddress } from "@/lib/format";

/**
 * Pays someone straight away, rather than sending them a request. Used when the wheel lands on
 * you and the app already knows where the money should go.
 */
export function SendMoney({
  amount,
  to,
  toName,
  memo,
  onDone,
}: {
  amount: bigint;
  to?: Address;
  toName?: string;
  memo: string;
  onDone?: () => void;
}) {
  const tx = useTx();
  const [manual, setManual] = useState("");
  const [sent, setSent] = useState(false);

  const recipient = to ?? (isAddress(manual.trim()) ? (manual.trim() as Address) : undefined);

  async function pay() {
    if (!recipient) return;
    await tx.send(
      { address: PAYEER, abi: payeerAbi, functionName: "send", args: [recipient, amount, memo.slice(0, 280)] },
      { spend: amount, pending: `Sending $${formatUsdc(amount)}…`, success: `Sent $${formatUsdc(amount)}` },
    );
    setSent(true);
    celebrate();
    tx.reset();
    onDone?.();
  }

  if (sent) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-2xl bg-success/12 px-4 py-3 text-sm font-medium text-success">
        <Check className="size-4" /> Paid {toName ?? shortAddress(recipient)} ${formatUsdc(amount)}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!to && (
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Their wallet address (0x…)"
          spellCheck={false}
          className="font-mono text-sm"
        />
      )}
      <Button size="lg" loading={tx.busy} disabled={!recipient} onClick={() => pay().catch(() => {})}>
        {to && toName ? (
          <>
            <Avatar seed={to} label={toName} size={20} /> Pay {toName} ${formatUsdc(amount)}
          </>
        ) : (
          <>
            <Send className="size-4" /> {tx.step === "approving" ? "Approving USDC…" : `Send $${formatUsdc(amount)}`}
          </>
        )}
      </Button>
    </div>
  );
}

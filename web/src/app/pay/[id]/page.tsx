"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "motion/react";
import { CheckCircle2, Clock, ExternalLink, Plus, Share2, XCircle } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "@/components/connect";
import { Logo } from "@/components/shell";
import { Sheet } from "@/components/sheet";
import { ShareLink } from "@/components/share-link";
import { AmountInput, Avatar, Badge, Button, Card, Skeleton } from "@/components/ui";
import { useRequest, type RequestStatus } from "@/hooks/use-payeer";
import { useTx } from "@/hooks/use-tx";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { payeerAbi } from "@/lib/abi";
import { explorerAddress, explorerTx, PAYEER } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { formatUsdc, parseUsdc, relativeTime, shortAddress } from "@/lib/format";
import { payUrl } from "@/lib/requests";

export default function PayPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;
  const { data: req, isLoading, refetch } = useRequest(id);
  const { address, isConnected } = useActiveAccount();
  const { data: balance } = useUsdcBalance();
  const tx = useTx();
  const [custom, setCustom] = useState("");
  const [paidHash, setPaidHash] = useState<string>();
  const [shareOpen, setShareOpen] = useState(false);

  if (isLoading || (id !== undefined && !req)) {
    return (
      <Frame>
        <Skeleton className="mx-auto size-16 rounded-full" />
        <Skeleton className="mx-auto mt-4 h-12 w-40" />
        <Skeleton className="mt-8 h-14 rounded-full" />
      </Frame>
    );
  }

  if (!req || req.status === "missing") {
    return (
      <Frame>
        <XCircle className="mx-auto size-12 text-muted" />
        <h1 className="mt-3 text-xl font-semibold">Link not found</h1>
        <p className="mt-1 text-sm text-muted">Double-check the link with whoever sent it.</p>
      </Frame>
    );
  }

  const isCreator = address?.toLowerCase() === req.creator.toLowerCase();
  const amount = req.amount > 0n ? req.amount : parseUsdc(custom);
  const insufficient = amount !== undefined && balance !== undefined && balance < amount;
  const payable = req.status === "open" && !isCreator;

  async function pay() {
    if (!amount || !req) return;
    const receipt = await tx.send(
      { address: PAYEER, abi: payeerAbi, functionName: "payRequest", args: [req.id, amount] },
      { spend: amount, pending: "Sending payment…", success: `Paid $${formatUsdc(amount)}` },
    );
    setPaidHash(receipt.transactionHash);
    celebrate();
    refetch();
  }

  async function cancel() {
    if (!req) return;
    await tx.send(
      { address: PAYEER, abi: payeerAbi, functionName: "cancelRequest", args: [req.id] },
      { pending: "Cancelling…", success: "Request cancelled" },
    );
    tx.reset();
    refetch();
  }

  if (paidHash) {
    return (
      <Frame>
        <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 16 }}>
          <CheckCircle2 className="mx-auto size-16 text-success" />
        </motion.div>
        <h1 className="mt-4 text-2xl font-semibold">Payment sent</h1>
        <p className="tabular mt-1 text-4xl font-semibold">${formatUsdc(amount)}</p>
        <p className="mt-2 text-sm text-muted">to {shortAddress(req.creator)} · settled on Arc</p>
        <div className="mt-8 grid gap-2">
          <Button variant="secondary" onClick={() => window.open(explorerTx(paidHash), "_blank")}>
            <ExternalLink className="size-4" /> View receipt
          </Button>
          <Link href="/" className="text-sm text-muted hover:text-fg">
            Get your own Payeer link →
          </Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame>
      <a href={explorerAddress(req.creator)} target="_blank" rel="noreferrer" className="inline-flex flex-col items-center gap-2">
        <Avatar seed={req.creator} size={64} />
        <span className="text-sm text-muted">{isCreator ? "Your request" : `${shortAddress(req.creator)} requests`}</span>
      </a>

      {req.amount > 0n ? (
        <p className="tabular mt-3 text-6xl font-semibold tracking-tight">${formatUsdc(req.amount)}</p>
      ) : payable ? (
        <AmountInput value={custom} onChange={setCustom} autoFocus placeholder="0.00" />
      ) : (
        <p className="mt-3 text-3xl font-semibold">Any amount</p>
      )}
      {req.memo && <p className="mt-2 text-lg">{req.memo}</p>}

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <StatusBadge status={req.status} />
        {req.expiresAt > 0 && req.status === "open" && (
          <Badge>
            <Clock className="size-3" /> Expires {relativeTime(req.expiresAt)}
          </Badge>
        )}
        {req.reusable && req.payments > 0 && (
          <Badge tone="success">
            {req.payments} paid · ${formatUsdc(req.totalReceived)}
          </Badge>
        )}
      </div>

      <div className="mt-8 space-y-3">
        {req.status !== "open" && <Closed status={req.status} isCreator={isCreator} />}

        {isCreator ? (
          <>
            {req.status === "open" && (
              <>
                <Button size="lg" onClick={() => setShareOpen(true)}>
                  <Share2 className="size-4" /> Share link
                </Button>
                <Button variant="ghost" className="w-full" loading={tx.busy} onClick={() => cancel().catch(() => {})}>
                  Cancel request
                </Button>
                <p className="text-xs text-muted">
                  Nothing is held here: money only moves when someone pays. Cancelling just closes the link.
                </p>
              </>
            )}
          </>
        ) : !payable ? null : !isConnected ? (
          <div className="flex justify-center">
            <ConnectButton size="lg" label="Connect to pay" />
          </div>
        ) : (
          <>
            <Button size="lg" disabled={!amount || insufficient} loading={tx.busy} onClick={() => pay().catch(() => {})}>
              {tx.step === "approving" ? "Approving USDC…" : tx.step === "confirming" ? "Paying…" : `Pay${amount ? ` $${formatUsdc(amount)}` : ""}`}
            </Button>
            {insufficient ? (
              <p className="text-xs text-muted">
                You have ${formatUsdc(balance)} on Arc.{" "}
                <Link href="/fund" className="text-accent hover:underline">
                  Add money
                </Link>{" "}
                to continue.
              </p>
            ) : (
              <p className="text-xs text-muted">Two quick wallet steps the first time: approve, then pay. Fees are a fraction of a cent in USDC.</p>
            )}
          </>
        )}
      </div>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Share request">
        <ShareLink url={typeof window === "undefined" ? "" : payUrl(req.id)} title="Payeer request" text={req.memo || "Pay me on Payeer"} />
      </Sheet>
    </Frame>
  );
}

/**
 * What a closed request means, and where to go next. A request is an invoice rather than an
 * escrow: nothing is held, so cancelling or expiring costs nobody anything.
 */
function Closed({ status, isCreator }: { status: RequestStatus; isCreator: boolean }) {
  const lines: Record<string, { body: string; action: ReactNode }> = {
    cancelled: {
      body: isCreator
        ? "You closed this link, so it can't be paid any more. No money moved — a request only collects when someone pays it."
        : "Whoever sent this link closed it, so it can't be paid. You haven't been charged.",
      action: isCreator ? <NextSteps /> : <StartYourOwn />,
    },
    expired: {
      body: isCreator
        ? "This link has passed its expiry date. Nothing was collected, and nothing was held."
        : "This link expired before it was paid. You haven't been charged.",
      action: isCreator ? <NextSteps /> : <StartYourOwn />,
    },
    paid: {
      body: isCreator ? "Paid in full and settled on Arc. The money is in your wallet." : "This one's already been paid.",
      action: isCreator ? <NextSteps /> : <StartYourOwn />,
    },
    missing: { body: "", action: null },
  };

  const line = lines[status];
  if (!line?.body) return null;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{line.body}</p>
      {line.action}
    </div>
  );
}

function NextSteps() {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Link href="/request" className="bg-brand flex h-11 items-center justify-center gap-2 rounded-full text-sm font-medium text-accent-fg">
        <Plus className="size-4" /> New request
      </Link>
      <Link href="/activity" className="flex h-11 items-center justify-center rounded-full bg-surface-2 text-sm font-medium">
        Your activity
      </Link>
    </div>
  );
}

function StartYourOwn() {
  return (
    <Link href="/" className="flex h-11 items-center justify-center rounded-full bg-surface-2 text-sm font-medium">
      Get your own Payeer link
    </Link>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "open") return <Badge tone="accent">Awaiting payment</Badge>;
  if (status === "paid") return <Badge tone="success"><CheckCircle2 className="size-3" /> Paid</Badge>;
  if (status === "expired") return <Badge tone="warn">Expired</Badge>;
  return <Badge>Cancelled</Badge>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col pt-4 sm:pt-10">
      <Card className="px-6 py-10 text-center">{children}</Card>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted">
        <Logo size={16} /> Secured by smart contract on Arc
      </p>
    </div>
  );
}

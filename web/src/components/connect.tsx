"use client";

import { Check, Copy, ExternalLink, LogOut, Wallet } from "lucide-react";
import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { toast } from "sonner";
import { Avatar, Button } from "./ui";
import { Sheet } from "./sheet";
import { explorerAddress } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { formatUsdc, shortAddress } from "@/lib/format";
import { useUsdcBalance } from "@/hooks/use-usdc";

export function ConnectButton({ size = "sm", label = "Connect" }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const { address, isConnected } = useConnection();
  const [open, setOpen] = useState(false);

  return (
    <>
      {isConnected && address ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium transition hover:bg-surface-2"
        >
          <Avatar seed={address} size={28} />
          <span className="tabular">{shortAddress(address)}</span>
        </button>
      ) : (
        <Button size={size} onClick={() => setOpen(true)}>
          <Wallet className="size-4" /> {label}
        </Button>
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={isConnected ? "Your wallet" : "Get started"}>
        {isConnected ? <AccountPanel onDone={() => setOpen(false)} /> : <ConnectorList onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function ConnectorList({ onDone }: { onDone: () => void }) {
  const connectors = useConnectors();
  const { mutateAsync: connect, isPending, variables } = useConnect();

  // The generic injected connector duplicates any EIP-6963 wallet that announced itself.
  const list = connectors.length > 1 ? connectors.filter((c) => c.id !== "injected") : connectors;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Payeer runs on Arc, where fees are paid in USDC. No other token needed.</p>
      {list.map((c) => (
        <button
          key={c.uid}
          disabled={isPending}
          onClick={async () => {
            try {
              await connect({ connector: c });
              onDone();
            } catch (e) {
              toast.error(friendlyError(e));
            }
          }}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface-2/50 p-4 text-left transition hover:border-accent/50 hover:bg-surface-2 disabled:opacity-60"
        >
          {c.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.icon} alt="" className="size-9 rounded-xl" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <Wallet className="size-5" />
            </span>
          )}
          <span className="flex-1 font-medium">{c.id === "injected" ? "Browser wallet" : c.name}</span>
          {isPending && variables?.connector === c && <span className="text-xs text-muted">Opening…</span>}
        </button>
      ))}
      <p className="pt-2 text-center text-xs text-muted">
        New to crypto?{" "}
        <a href="https://metamask.io/download" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Get a wallet
        </a>{" "}
        in a minute.
      </p>
    </div>
  );
}

function AccountPanel({ onDone }: { onDone: () => void }) {
  const { address } = useConnection();
  const { mutate: disconnect } = useDisconnect();
  const { data: balance } = useUsdcBalance();
  const [copied, setCopied] = useState(false);
  if (!address) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar seed={address} size={64} />
        <div>
          <p className="tabular text-3xl font-semibold">${formatUsdc(balance)}</p>
          <p className="text-sm text-muted">USDC on Arc</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? "Copied" : shortAddress(address)}
        </Button>
        <Button variant="secondary" onClick={() => window.open(explorerAddress(address), "_blank")}>
          <ExternalLink className="size-4" /> Explorer
        </Button>
      </div>
      <Button
        variant="danger"
        size="lg"
        onClick={() => {
          disconnect();
          onDone();
        }}
      >
        <LogOut className="size-4" /> Disconnect
      </Button>
    </div>
  );
}

"use client";

import { useAppKit } from "@reown/appkit/react";
import { TriangleAlert, Wallet } from "lucide-react";
import { useConnection } from "wagmi";
import { CircleAccount, CircleSignIn } from "./circle-signin";
import { useCircle } from "./circle-provider";
import { Avatar, Button } from "./ui";
import { shortAddress } from "@/lib/format";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { appKitAvailable } from "@/lib/appkit";
import { formatUsdc } from "@/lib/format";

/**
 * Opens Reown AppKit, which handles the whole wallet story: installed wallets, a WalletConnect
 * QR code for phones, network switching and the account view once connected.
 */
export function ConnectButton({ size = "sm", label = "Connect" }: { size?: "sm" | "md" | "lg"; label?: string }) {
  // Without a Reown project id there is no modal to open, and calling its hook would throw and
  // take every page down with it. A deployment missing one variable should degrade, not die.
  if (!appKitAvailable) return <WalletUnavailable size={size} />;
  return <WalletConnect size={size} label={label} />;
}

function WalletUnavailable({ size }: { size: "sm" | "md" | "lg" }) {
  const circle = useCircle();
  if (circle.session) return <CircleAccount />;
  return (
    <div className="flex items-center gap-2">
      <Button size={size} variant="secondary" disabled title="Set NEXT_PUBLIC_REOWN_PROJECT_ID to enable wallets">
        <TriangleAlert className="size-4" /> Wallets unavailable
      </Button>
      {size !== "sm" && <CircleSignIn size={size} />}
    </div>
  );
}

function WalletConnect({ size, label }: { size: "sm" | "md" | "lg"; label: string }) {
  const { open } = useAppKit();
  const { address, isConnected } = useConnection();
  const { data: balance } = useUsdcBalance();
  const circle = useCircle();

  if (circle.session) return <CircleAccount />;

  if (isConnected && address) {
    return (
      <button
        onClick={() => open()}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium transition hover:bg-surface-2"
      >
        <Avatar seed={address} size={28} />
        <span className="tabular hidden sm:inline">${formatUsdc(balance)}</span>
        <span className="tabular text-muted">{shortAddress(address)}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button size={size} onClick={() => open({ view: "Connect" })}>
        <Wallet className="size-4" /> {label}
      </Button>
      {size !== "sm" && <CircleSignIn size={size} />}
    </div>
  );
}

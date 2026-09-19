"use client";

import type { Address } from "viem";
import { useConnection } from "wagmi";
import { useCircle } from "@/components/circle-provider";

/**
 * The account Payeer is acting as: either a connected wallet, or a Circle wallet created
 * from an email sign-in. Screens shouldn't care which.
 */
export function useActiveAccount(): { address?: Address; isConnected: boolean; kind: "wallet" | "circle" | "none" } {
  const { address, isConnected } = useConnection();
  const { session } = useCircle();

  if (session) return { address: session.address, isConnected: true, kind: "circle" };
  if (isConnected && address) return { address, isConnected: true, kind: "wallet" };
  return { isConnected: false, kind: "none" };
}

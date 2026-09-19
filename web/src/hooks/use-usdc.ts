"use client";

import { erc20Abi } from "viem";
import { useReadContract } from "wagmi";
import { useActiveAccount } from "./use-account";
import { USDC } from "@/lib/config";

export function useUsdcBalance() {
  const { address } = useActiveAccount();
  return useReadContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
}

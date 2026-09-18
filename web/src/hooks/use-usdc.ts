"use client";

import { erc20Abi } from "viem";
import { useConnection, useReadContract } from "wagmi";
import { USDC } from "@/lib/config";

export function useUsdcBalance() {
  const { address } = useConnection();
  return useReadContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
}

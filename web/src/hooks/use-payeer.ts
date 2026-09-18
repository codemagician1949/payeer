"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";

export type RequestStatus = "open" | "paid" | "cancelled" | "expired" | "missing";

export type PaymentRequest = {
  id: bigint;
  creator: Address;
  amount: bigint; // 0 = payer chooses
  expiresAt: number;
  reusable: boolean;
  status: RequestStatus;
  payments: number;
  totalReceived: bigint;
  memo: string;
};

const statusNames = ["missing", "open", "paid", "cancelled"] as const;

function toRequest(
  id: bigint,
  raw: readonly [Address, bigint, number, boolean, number, number, bigint],
  memo: string,
): PaymentRequest {
  const [creator, amount, expiresAt, reusable, statusIdx, payments, totalReceived] = raw;
  let status: RequestStatus = statusNames[statusIdx] ?? "missing";
  if (status === "open" && expiresAt !== 0 && Date.now() / 1000 > expiresAt) status = "expired";
  return { id, creator, amount, expiresAt, reusable, status, payments, totalReceived, memo };
}

export function useRequest(id: bigint | undefined) {
  const q = useReadContracts({
    contracts: [
      { address: PAYEER, abi: payeerAbi, functionName: "requests", args: [id ?? 0n] },
      { address: PAYEER, abi: payeerAbi, functionName: "memoOf", args: [id ?? 0n] },
    ],
    allowFailure: false,
    query: { enabled: id !== undefined, refetchInterval: 5_000 },
  });
  const data = q.data && id !== undefined ? toRequest(id, q.data[0], q.data[1]) : undefined;
  return { ...q, data };
}

export function useMyRequests(address: Address | undefined) {
  const ids = useReadContract({
    address: PAYEER,
    abi: payeerAbi,
    functionName: "requestsBy",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  // Newest first, capped so the page stays fast.
  const recent = [...(ids.data ?? [])].reverse().slice(0, 50);

  const details = useReadContracts({
    contracts: recent.flatMap((id) => [
      { address: PAYEER, abi: payeerAbi, functionName: "requests", args: [id] } as const,
      { address: PAYEER, abi: payeerAbi, functionName: "memoOf", args: [id] } as const,
    ]),
    allowFailure: false,
    query: { enabled: recent.length > 0, refetchInterval: 10_000 },
  });

  const list = details.data
    ? recent.map((id, i) =>
        toRequest(
          id,
          details.data[i * 2] as readonly [Address, bigint, number, boolean, number, number, bigint],
          details.data[i * 2 + 1] as string,
        ),
      )
    : undefined;

  return {
    data: ids.data && ids.data.length === 0 ? [] : list,
    isLoading: ids.isLoading || (recent.length > 0 && details.isLoading),
    refetch: () => Promise.all([ids.refetch(), details.refetch()]),
  };
}

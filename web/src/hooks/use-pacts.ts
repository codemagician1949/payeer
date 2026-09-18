"use client";

import type { Address } from "viem";
import { useReadContract, useReadContracts } from "wagmi";
import { pactsAbi } from "@/lib/abi";
import { PACTS } from "@/lib/config";
import { stageOf, type PactStage, type RawPact } from "@/lib/pact-stage";

export type { PactStage };

export type PactView = {
  id: bigint;
  creator: Address;
  stake: bigint;
  joinDeadline: number;
  resolveBy: number;
  challengeWindow: number;
  maxParticipants: number;
  participantCount: number;
  aiResolved: boolean;
  proposed: boolean;
  disputed: boolean;
  proposedOption: number;
  proposedAt: number;
  winningOption: number;
  winnerCount: number;
  terms: string;
  options: string[];
  participants: Address[];
  stage: PactStage;
  pot: bigint;
};

export function usePact(id: bigint | undefined, viewer?: Address) {
  const enabled = id !== undefined;
  const pid = id ?? 0n;
  const who = viewer ?? "0x0000000000000000000000000000000000000000";
  const q = useReadContracts({
    contracts: [
      { address: PACTS, abi: pactsAbi, functionName: "getPact", args: [pid] },
      { address: PACTS, abi: pactsAbi, functionName: "termsOf", args: [pid] },
      { address: PACTS, abi: pactsAbi, functionName: "getOptions", args: [pid] },
      { address: PACTS, abi: pactsAbi, functionName: "getParticipants", args: [pid] },
      { address: PACTS, abi: pactsAbi, functionName: "pickOf", args: [pid, who] },
      { address: PACTS, abi: pactsAbi, functionName: "voteOf", args: [pid, who] },
      { address: PACTS, abi: pactsAbi, functionName: "claimable", args: [pid, who] },
      { address: PACTS, abi: pactsAbi, functionName: "claimed", args: [pid, who] },
      { address: PACTS, abi: pactsAbi, functionName: "proposalSourceOf", args: [pid] },
    ],
    allowFailure: false,
    query: { enabled, refetchInterval: 5_000 },
  });

  if (!q.data || id === undefined) return { ...q, data: undefined, me: undefined };
  const [raw, terms, options, participants, pick, vote, claimable, claimed, proposalSource] = q.data;
  const pact = { ...toView(id, raw, terms, options, participants), proposalSource };
  return {
    ...q,
    data: pact.creator === "0x0000000000000000000000000000000000000000" ? null : pact,
    me: { pick, vote: vote === 0 ? undefined : vote - 1, claimable, claimed },
  };
}

function toView(id: bigint, raw: RawPact, terms: string, options: readonly string[], participants: readonly Address[]): PactView {
  return {
    id,
    creator: raw.creator,
    stake: raw.stake,
    joinDeadline: raw.joinDeadline,
    resolveBy: raw.resolveBy,
    challengeWindow: raw.challengeWindow,
    maxParticipants: raw.maxParticipants,
    participantCount: raw.participantCount,
    aiResolved: raw.aiResolved,
    proposed: raw.proposed,
    disputed: raw.disputed,
    proposedOption: raw.proposedOption,
    proposedAt: raw.proposedAt,
    winningOption: raw.winningOption,
    winnerCount: raw.winnerCount,
    terms,
    options: [...options],
    participants: [...participants],
    stage: stageOf(raw),
    pot: raw.stake * BigInt(raw.participantCount),
  };
}

export function useMyPacts(address: Address | undefined) {
  const ids = useReadContract({
    address: PACTS,
    abi: pactsAbi,
    functionName: "pactsOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const recent = [...(ids.data ?? [])].reverse().slice(0, 30);

  const details = useReadContracts({
    contracts: recent.flatMap((id) => [
      { address: PACTS, abi: pactsAbi, functionName: "getPact", args: [id] } as const,
      { address: PACTS, abi: pactsAbi, functionName: "termsOf", args: [id] } as const,
      { address: PACTS, abi: pactsAbi, functionName: "getOptions", args: [id] } as const,
      { address: PACTS, abi: pactsAbi, functionName: "claimable", args: [id, address!] } as const,
    ]),
    allowFailure: false,
    query: { enabled: !!address && recent.length > 0, refetchInterval: 10_000 },
  });

  const list = details.data
    ? recent.map((id, i) => {
        const d = details.data;
        return {
          ...toView(id, d[i * 4] as RawPact, d[i * 4 + 1] as string, d[i * 4 + 2] as readonly string[], []),
          claimable: d[i * 4 + 3] as bigint,
        };
      })
    : undefined;

  return {
    data: ids.data && ids.data.length === 0 ? [] : list,
    isLoading: ids.isLoading || (recent.length > 0 && details.isLoading),
  };
}

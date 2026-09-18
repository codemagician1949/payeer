// Shared by the UI and the resolver API route, so it must stay free of client-only code.

import type { Address } from "viem";

export type PactStage =
  | "joining" // open for people to join
  | "deciding" // joining closed, waiting for votes or a result
  | "proposed" // AI result posted, objection window open
  | "finalizable" // objection window passed, anyone can finalize
  | "disputed" // AI result disputed, back to unanimous vote
  | "refundable" // can no longer settle, anyone can trigger refunds
  | "settled"
  | "refunded";

export type RawPact = {
  creator: Address;
  stake: bigint;
  joinDeadline: number;
  resolveBy: number;
  challengeWindow: number;
  optionCount: number;
  maxParticipants: number;
  participantCount: number;
  aiResolved: boolean;
  phase: number;
  proposed: boolean;
  disputed: boolean;
  proposedOption: number;
  proposedAt: number;
  winningOption: number;
  winnerCount: number;
  claimCount: number;
  paidOut: bigint;
};

/** Mirrors the contract's state machine so the UI shows exactly the actions that will succeed. */
export function stageOf(p: RawPact, now = Date.now() / 1000): PactStage {
  if (p.phase === 2) return "settled";
  if (p.phase === 3) return "refunded";
  const full = p.participantCount === p.maxParticipants;
  const joiningClosed = now > p.joinDeadline || full;
  if (now > p.joinDeadline && p.participantCount < 2) return "refundable";
  if (!joiningClosed) return "joining";
  if (p.proposed && !p.disputed) {
    return now > p.proposedAt + p.challengeWindow ? "finalizable" : "proposed";
  }
  if (now > p.resolveBy) return "refundable";
  return p.disputed ? "disputed" : "deciding";
}

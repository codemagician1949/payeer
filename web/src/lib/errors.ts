import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const messages: Record<string, string> = {
  // Payeer
  InvalidAmount: "That amount doesn't match this request.",
  InvalidExpiry: "Pick an expiry in the future.",
  InvalidRecipient: "Check the recipient address.",
  MemoTooLong: "Keep the note under 280 characters.",
  NotOpen: "This request is no longer open.",
  Expired: "This request has expired.",
  NotCreator: "Only the creator can do that.",
  SelfPayment: "You can't pay your own request.",
  LengthMismatch: "Each recipient needs an amount.",
  BatchTooLarge: "Up to 100 recipients per batch.",
  // Pacts
  BadParams: "Some pact details aren't valid.",
  NotActive: "This pact is already closed.",
  JoinClosed: "Joining has closed for this pact.",
  JoiningOpen: "Wait until joining closes or the pact is full.",
  AlreadyJoined: "You're already in this pact.",
  PactFull: "This pact is full.",
  BadOption: "Pick one of the outcomes.",
  NotParticipant: "Only people in this pact can do that.",
  NotResolver: "Only the result checker can propose an outcome.",
  NotAiPact: "This pact is settled by agreement.",
  AlreadyProposed: "A result has already been proposed.",
  NoProposal: "There's no undisputed result to finalize.",
  AlreadyDisputed: "This result is already disputed.",
  WindowOpen: "The objection window is still open.",
  WindowClosed: "The objection window has closed.",
  TooLate: "The resolve deadline has passed.",
  TooEarly: "It's too early for a refund.",
  NothingToClaim: "Nothing to claim here.",
  ERC20InsufficientBalance: "Not enough USDC in your wallet.",
};

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    if (err.walk((e) => e instanceof UserRejectedRequestError)) return "You cancelled in your wallet.";
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && messages[name]) return messages[name];
    }
    if (/insufficient funds/i.test(err.message)) return "Not enough USDC to cover the network fee.";
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

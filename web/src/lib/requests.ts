import { parseEventLogs, type TransactionReceipt } from "viem";
import { readContract } from "wagmi/actions";
import type { Config } from "wagmi";
import { payeerAbi, pactsAbi } from "./abi";
import { PACTS, PAYEER } from "./config";

/**
 * A wallet transaction comes back with logs, so the new id is right there. Circle settles
 * asynchronously and hands back no logs, so we watch the creator's own list on-chain instead.
 */
export async function newRequestId(config: Config, receipt: TransactionReceipt, creator: `0x${string}`, before: number) {
  const [log] = parseEventLogs({ abi: payeerAbi, eventName: "RequestCreated", logs: receipt.logs ?? [] });
  if (log) return log.args.id;
  return waitForNewId(() => readContract(config, { address: PAYEER, abi: payeerAbi, functionName: "requestsBy", args: [creator] }), before, "request");
}

export async function newPactId(config: Config, receipt: TransactionReceipt, creator: `0x${string}`, before: number) {
  const [log] = parseEventLogs({ abi: pactsAbi, eventName: "PactCreated", logs: receipt.logs ?? [] });
  if (log) return log.args.id;
  return waitForNewId(() => readContract(config, { address: PACTS, abi: pactsAbi, functionName: "pactsOf", args: [creator] }), before, "pact");
}

/** Counts what the creator already had, so the new entry can be told apart from the old ones. */
export async function countRequests(config: Config, creator: `0x${string}`) {
  const ids = await readContract(config, { address: PAYEER, abi: payeerAbi, functionName: "requestsBy", args: [creator] });
  return ids.length;
}

export async function countPacts(config: Config, creator: `0x${string}`) {
  const ids = await readContract(config, { address: PACTS, abi: pactsAbi, functionName: "pactsOf", args: [creator] });
  return ids.length;
}

async function waitForNewId(read: () => Promise<readonly bigint[]>, before: number, what: string) {
  for (let attempt = 0; attempt < 45; attempt++) {
    const ids = await read().catch(() => [] as readonly bigint[]);
    if (ids.length > before) return ids[ids.length - 1];
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Your ${what} was sent, but is taking a while to appear. Check your activity in a moment.`);
}

export function payUrl(id: bigint) {
  return `${window.location.origin}/pay/${id}`;
}

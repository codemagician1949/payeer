import { parseEventLogs, type TransactionReceipt } from "viem";
import { payeerAbi, pactsAbi } from "./abi";

export function requestIdFrom(receipt: TransactionReceipt) {
  const [log] = parseEventLogs({ abi: payeerAbi, eventName: "RequestCreated", logs: receipt.logs });
  if (!log) throw new Error("Request created, but its id wasn't found in the receipt.");
  return log.args.id;
}

export function pactIdFrom(receipt: TransactionReceipt) {
  const [log] = parseEventLogs({ abi: pactsAbi, eventName: "PactCreated", logs: receipt.logs });
  if (!log) throw new Error("Pact created, but its id wasn't found in the receipt.");
  return log.args.id;
}

export function payUrl(id: bigint) {
  return `${window.location.origin}/pay/${id}`;
}

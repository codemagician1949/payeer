"use client";

import { useState } from "react";
import {
  erc20Abi,
  getAbiItem,
  toFunctionSignature,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type TransactionReceipt,
} from "viem";
import { useConfig } from "wagmi";
import { readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { toast } from "sonner";
import { useCircle } from "@/components/circle-provider";
import { useActiveAccount } from "./use-account";
import { chain, explorerTx, USDC } from "@/lib/config";
import { friendlyError } from "@/lib/errors";

export type TxStep = "idle" | "approving" | "confirming" | "done";

type Call<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">> = {
  address: Address;
  abi: abi;
  functionName: fn;
  args: ContractFunctionArgs<abi, "nonpayable", fn>;
};

/** Circle takes arguments as JSON, so bigints become decimal strings and structs become arrays. */
function toCircleParameters(args: readonly unknown[]): unknown[] {
  const convert = (value: unknown): unknown => {
    if (typeof value === "bigint") return value.toString();
    if (Array.isArray(value)) return value.map(convert);
    if (value && typeof value === "object") return Object.values(value).map(convert);
    return value;
  };
  return args.map(convert);
}

/**
 * Sends a contract write on Arc, approving USDC first when `spend` is set.
 *
 * Works for both kinds of account: a connected wallet signs through wagmi, while an email
 * sign-in goes through Circle, which asks for the person's PIN instead.
 */
export function useTx() {
  const config = useConfig();
  const { address, kind } = useActiveAccount();
  const circle = useCircle();
  const [step, setStep] = useState<TxStep>("idle");

  async function send<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">>(
    call: Call<abi, fn>,
    opts: { spend?: bigint; pending: string; success: string },
  ): Promise<TransactionReceipt> {
    if (!address) throw new Error("Sign in first.");
    const toastId = toast.loading(opts.pending);

    try {
      if (kind === "circle") {
        if (opts.spend && opts.spend > 0n) {
          setStep("approving");
          toast.loading("Approving USDC — confirm with your PIN…", { id: toastId });
          await circle.execute({
            contractAddress: USDC,
            abiFunctionSignature: "approve(address,uint256)",
            abiParameters: [call.address, opts.spend.toString()],
          });
        }

        setStep("confirming");
        toast.loading(opts.pending, { id: toastId });
        // Generic ABI types don't narrow here; the call shape is validated by the caller's types.
        const item = getAbiItem({ abi: call.abi, name: call.functionName } as never);
        if (!item) throw new Error(`${String(call.functionName)} isn't in the contract's ABI.`);
        await circle.execute({
          contractAddress: call.address,
          abiFunctionSignature: toFunctionSignature(item as never),
          abiParameters: toCircleParameters(call.args as readonly unknown[]),
        });

        setStep("done");
        toast.success(opts.success, { id: toastId });
        // Circle settles asynchronously; the UI re-reads from the chain rather than a receipt.
        return { transactionHash: "0x", status: "success" } as unknown as TransactionReceipt;
      }

      if (config.state.chainId !== chain.id) await switchChain(config, { chainId: chain.id });

      if (opts.spend && opts.spend > 0n) {
        const allowance = await readContract(config, {
          address: USDC,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, call.address],
        });
        if (allowance < opts.spend) {
          setStep("approving");
          toast.loading("Approve USDC in your wallet…", { id: toastId });
          const approveHash = await writeContract(config, {
            address: USDC,
            abi: erc20Abi,
            functionName: "approve",
            args: [call.address, opts.spend],
          });
          await waitForTransactionReceipt(config, { hash: approveHash });
        }
      }

      setStep("confirming");
      toast.loading(opts.pending, { id: toastId });
      // Generic contract types don't narrow through simulate -> write; the call shape is checked above.
      const { request } = await simulateContract(config, { ...call, account: address } as never);
      const hash = await writeContract(config, request);
      const receipt = await waitForTransactionReceipt(config, { hash });
      if (receipt.status !== "success") throw new Error("Transaction failed on-chain.");

      setStep("done");
      toast.success(opts.success, {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTx(hash), "_blank") },
      });
      return receipt;
    } catch (err) {
      setStep("idle");
      toast.error(friendlyError(err), { id: toastId });
      throw err;
    }
  }

  return { send, step, busy: step === "approving" || step === "confirming", reset: () => setStep("idle") };
}

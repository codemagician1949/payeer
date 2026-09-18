"use client";

import { useState } from "react";
import { erc20Abi, type Abi, type Address, type ContractFunctionArgs, type ContractFunctionName } from "viem";
import { useConfig, useConnection } from "wagmi";
import { readContract, simulateContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { toast } from "sonner";
import { chain, explorerTx, USDC } from "@/lib/config";
import { friendlyError } from "@/lib/errors";

export type TxStep = "idle" | "approving" | "confirming" | "done";

type Call<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">> = {
  address: Address;
  abi: abi;
  functionName: fn;
  args: ContractFunctionArgs<abi, "nonpayable", fn>;
};

/**
 * Sends a contract write on Arc, first approving USDC for the target contract when `spend` is set.
 * Handles chain switching, simulation (so reverts surface before the wallet opens) and toasts.
 */
export function useTx() {
  const config = useConfig();
  const { address, chainId } = useConnection();
  const [step, setStep] = useState<TxStep>("idle");

  async function send<abi extends Abi, fn extends ContractFunctionName<abi, "nonpayable">>(
    call: Call<abi, fn>,
    opts: { spend?: bigint; pending: string; success: string },
  ) {
    if (!address) throw new Error("Connect a wallet first.");
    const toastId = toast.loading(opts.pending);
    try {
      if (chainId !== chain.id) await switchChain(config, { chainId: chain.id });

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

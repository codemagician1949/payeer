"use client";

import { motion } from "motion/react";
import { ArrowDown, Check, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { erc20Abi } from "viem";
import { useConfig, useConnection, useReadContract } from "wagmi";
import { readContract, switchChain, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { toast } from "sonner";
import { ConnectButton } from "@/components/connect";
import { AmountInput, Button, Card, PageHeader, Segmented } from "@/components/ui";
import { useUsdcBalance } from "@/hooks/use-usdc";
import {
  ARC_DOMAIN,
  FAST,
  MESSAGE_TRANSMITTER,
  STANDARD,
  TOKEN_MESSENGER,
  feeFor,
  fetchFees,
  messageTransmitterAbi,
  sources,
  toBytes32,
  tokenMessengerAbi,
  waitForAttestation,
  type SourceChain,
} from "@/lib/cctp";
import { chain as arcChain } from "@/lib/config";
import { friendlyError } from "@/lib/errors";
import { cn, formatUsdc, parseUsdc } from "@/lib/format";

type Step = "form" | "burning" | "waiting" | "minting" | "done";
const PENDING_KEY = "payeer:pending-transfer";

export default function FundPage() {
  const config = useConfig();
  const { address, isConnected } = useConnection();
  const { data: arcBalance, refetch: refetchArc } = useUsdcBalance();
  const [source, setSource] = useState<SourceChain>(sources[0]);
  const [amount, setAmount] = useState("");
  const [speed, setSpeed] = useState<"fast" | "standard">("fast");
  const [step, setStep] = useState<Step>("form");
  const [feeBps, setFeeBps] = useState<Record<number, number>>({});
  const [received, setReceived] = useState<bigint>();
  const cancel = useRef<AbortController>(null);

  const parsed = parseUsdc(amount);

  const sourceBalance = useReadContract({
    address: source.usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: source.chain.id,
    query: { enabled: !!address },
  });

  useEffect(() => {
    let cancelled = false;
    fetchFees(source.domain)
      .then((fees) => {
        const fast = fees.find((f) => f.finalityThreshold <= FAST)?.minimumFee ?? 0;
        if (!cancelled) setFeeBps((m) => ({ ...m, [source.domain]: fast }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source.domain]);

  // A transfer can outlive the page: remember it so the mint can be finished on return.
  useEffect(() => {
    const saved = typeof window === "undefined" ? null : localStorage.getItem(PENDING_KEY);
    if (!saved) return;
    try {
      const { domain, txHash } = JSON.parse(saved);
      if (domain !== undefined && txHash) {
        toast("You have a transfer waiting to be collected.", {
          action: { label: "Finish it", onClick: () => finish(domain, txHash) },
          duration: 12_000,
        });
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bps = feeBps[source.domain] ?? 0;
  const fee = speed === "fast" && parsed ? feeFor(parsed, bps) : 0n;
  const willArrive = parsed ? parsed - fee : 0n;
  const insufficient = parsed !== undefined && sourceBalance.data !== undefined && sourceBalance.data < parsed;

  async function finish(domain: number, txHash: `0x${string}`) {
    try {
      setStep("waiting");
      cancel.current = new AbortController();
      const attestation = await waitForAttestation(domain, txHash, cancel.current.signal);

      setStep("minting");
      await switchChain(config, { chainId: arcChain.id });
      const mintHash = await writeContract(config, {
        address: MESSAGE_TRANSMITTER,
        abi: messageTransmitterAbi,
        functionName: "receiveMessage",
        args: [attestation.message, attestation.attestation],
        chainId: arcChain.id,
      });
      await waitForTransactionReceipt(config, { hash: mintHash, chainId: arcChain.id });

      localStorage.removeItem(PENDING_KEY);
      const after = await refetchArc();
      setReceived(after.data);
      setStep("done");
      toast.success("USDC arrived on Arc");
    } catch (err) {
      setStep("form");
      toast.error(friendlyError(err));
    }
  }

  async function start() {
    if (!parsed || !address) return;
    try {
      setStep("burning");
      await switchChain(config, { chainId: source.chain.id });

      const allowance = await readContract(config, {
        address: source.usdc,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, TOKEN_MESSENGER],
        chainId: source.chain.id,
      });
      if (allowance < parsed) {
        const approveHash = await writeContract(config, {
          address: source.usdc,
          abi: erc20Abi,
          functionName: "approve",
          args: [TOKEN_MESSENGER, parsed],
          chainId: source.chain.id,
        });
        await waitForTransactionReceipt(config, { hash: approveHash, chainId: source.chain.id });
      }

      const burnHash = await writeContract(config, {
        address: TOKEN_MESSENGER,
        abi: tokenMessengerAbi,
        functionName: "depositForBurn",
        args: [parsed, ARC_DOMAIN, toBytes32(address), source.usdc, toBytes32("0x0000000000000000000000000000000000000000"), fee, speed === "fast" ? FAST : STANDARD],
        chainId: source.chain.id,
      });
      await waitForTransactionReceipt(config, { hash: burnHash, chainId: source.chain.id });
      localStorage.setItem(PENDING_KEY, JSON.stringify({ domain: source.domain, txHash: burnHash }));

      await finish(source.domain, burnHash);
    } catch (err) {
      setStep("form");
      toast.error(friendlyError(err));
    }
  }

  if (step === "done") {
    return (
      <div className="mx-auto max-w-md">
        <Card className="text-center">
          <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <CheckCircle2 className="mx-auto mb-3 size-12 text-success" />
          </motion.div>
          <h1 className="text-2xl font-semibold">Money&apos;s in</h1>
          <p className="tabular mt-1 text-4xl font-semibold">${formatUsdc(received ?? arcBalance)}</p>
          <p className="mt-1 text-sm text-muted">Your USDC balance on Arc</p>
          <Button className="mt-6 w-full" onClick={() => { setStep("form"); setAmount(""); }}>
            Done
          </Button>
        </Card>
      </div>
    );
  }

  if (step !== "form") {
    const stages = [
      { key: "burning", label: `Sending from ${source.label}`, done: step !== "burning" },
      { key: "waiting", label: "Circle is confirming the transfer", done: step === "minting" },
      { key: "minting", label: "Collecting it on Arc", done: false },
    ];
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <h1 className="text-xl font-semibold">Moving your USDC</h1>
          <p className="mt-1 text-sm text-muted">
            Keep this page open. {speed === "standard" ? `The free route takes ${source.standardWait}.` : "This usually takes under a minute."}
          </p>
          <ul className="mt-6 space-y-4">
            {stages.map((s) => {
              const active = s.key === step;
              return (
                <li key={s.key} className="flex items-center gap-3">
                  <span className={cn("flex size-8 items-center justify-center rounded-full", s.done ? "bg-success/15 text-success" : active ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted")}>
                    {s.done ? <Check className="size-4" /> : active ? <Loader2 className="size-4 animate-spin" /> : <span className="size-2 rounded-full bg-current" />}
                  </span>
                  <span className={cn("text-sm", active || s.done ? "text-fg" : "text-muted")}>{s.label}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-xs text-muted">
            If you close this page, your money isn&apos;t lost: come back here and we&apos;ll finish collecting it.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Add money" subtitle="Move USDC you already hold on another network onto Arc." />
      <Card className="space-y-6">
        <div>
          <p className="mb-2 text-sm font-medium">From</p>
          <div className="grid grid-cols-2 gap-2">
            {sources.map((s) => (
              <button
                key={s.domain}
                onClick={() => setSource(s)}
                className={cn("rounded-2xl border p-3 text-left text-sm font-medium transition", source.domain === s.domain ? "border-accent bg-accent/10" : "border-border hover:border-accent/40")}
              >
                {s.label}
                {isConnected && source.domain === s.domain && (
                  <span className="mt-0.5 block text-xs font-normal text-muted">
                    {sourceBalance.isLoading ? "checking…" : `$${formatUsdc(sourceBalance.data)} available`}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <AmountInput value={amount} onChange={setAmount} />

        <div className="flex items-center justify-center">
          <ArrowDown className="size-5 text-muted" />
        </div>

        <div className="rounded-2xl bg-surface-2/60 p-4 text-center">
          <p className="tabular text-2xl font-semibold">${formatUsdc(willArrive)}</p>
          <p className="text-xs text-muted">arrives on Arc{fee > 0n && ` · $${formatUsdc(fee)} Circle fee`}</p>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Speed</p>
          <Segmented
            value={speed}
            onChange={setSpeed}
            options={[
              { value: "fast", label: "Fast (seconds)" },
              { value: "standard", label: `Free (${source.standardWait})` },
            ]}
          />
        </div>

        {isConnected ? (
          <>
            <Button size="lg" disabled={!parsed || insufficient} onClick={() => start().catch(() => {})}>
              {insufficient ? `Not enough USDC on ${source.label}` : parsed ? `Move $${formatUsdc(parsed)} to Arc` : "Enter an amount"}
            </Button>
            <p className="text-center text-xs text-muted">
              Two wallet confirmations: one to allow the transfer, one to send it. Your wallet will switch networks along the way.
            </p>
          </>
        ) : (
          <div className="flex justify-center">
            <ConnectButton size="lg" label="Connect to add money" />
          </div>
        )}
      </Card>

      <p className="mt-4 text-center text-xs text-muted">
        Powered by Circle&apos;s Cross-Chain Transfer Protocol.{" "}
        <a href="https://developers.circle.com/cctp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
          How it works <ExternalLink className="size-3" />
        </a>
      </p>
    </div>
  );
}

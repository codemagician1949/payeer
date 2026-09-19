"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Bot, CheckCircle2, ExternalLink, Info, Share2, ShieldAlert, Sparkles, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { useActiveAccount } from "@/hooks/use-account";
import { toast } from "sonner";
import { ChatPanel } from "@/components/chat-panel";
import { ConnectButton } from "@/components/connect";
import { formatCountdown, StageBadge } from "@/components/pact-bits";
import { Sheet } from "@/components/sheet";
import { ShareLink } from "@/components/share-link";
import { Avatar, Badge, Button, Card, Skeleton } from "@/components/ui";
import { usePact, type PactView } from "@/hooks/use-pacts";
import { useResolverAvailable } from "@/hooks/use-resolver";
import { useTx } from "@/hooks/use-tx";
import { useUsdcBalance } from "@/hooks/use-usdc";
import { pactsAbi } from "@/lib/abi";
import { chain, PACTS } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { cn, formatUsdc, shortAddress } from "@/lib/format";

function useNow() {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function usePicksAndVotes(pact: PactView | null | undefined) {
  const people = pact?.participants ?? [];
  const q = useReadContracts({
    contracts: people.flatMap((p) => [
      { address: PACTS, abi: pactsAbi, functionName: "pickOf", args: [pact!.id, p] } as const,
      { address: PACTS, abi: pactsAbi, functionName: "voteOf", args: [pact!.id, p] } as const,
    ]),
    allowFailure: false,
    query: { enabled: people.length > 0, refetchInterval: 5_000 },
  });
  return people.map((addr, i) => ({
    addr,
    pick: (q.data?.[i * 2] as number | undefined) ?? 0,
    vote: ((q.data?.[i * 2 + 1] as number | undefined) ?? 0) - 1, // -1 = no vote
  }));
}

export default function PactPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : undefined;
  const { address, isConnected } = useActiveAccount();
  const { data: pact, me, isLoading, refetch } = usePact(id, address);
  const people = usePicksAndVotes(pact);
  const { data: balance } = useUsdcBalance();
  const now = useNow();
  const tx = useTx();
  const aiAvailable = useResolverAvailable();
  const [choice, setChoice] = useState<number>();
  const [shareOpen, setShareOpen] = useState(search.get("new") === "1");
  const [checking, setChecking] = useState(false);
  const [aiNote, setAiNote] = useState<string>();

  if (isLoading || pact === undefined) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Skeleton className="h-40 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }
  if (!pact) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <XCircle className="mx-auto size-10 text-muted" />
        <p className="mt-3 font-semibold">Pact not found</p>
      </Card>
    );
  }

  const joined = !!me && me.pick > 0;
  const stage = pact.stage;
  const canVote = joined && ["deciding", "disputed", "proposed"].includes(stage);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/pacts/${pact.id}`;

  async function run(fn: Parameters<typeof tx.send>[0], opts: Parameters<typeof tx.send>[1]) {
    await tx.send(fn, opts);
    tx.reset();
    await refetch();
  }

  async function checkWithAi() {
    setChecking(true);
    setAiNote(undefined);
    try {
      const res = await fetch("/api/resolve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pactId: pact!.id.toString() }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't check the result.");
      if (body.status === "final") {
        toast.success("Result posted. Everyone has 24 hours to object.");
        await refetch();
      } else {
        setAiNote(body.summary || (body.status === "not_final" ? "The event hasn't finished yet." : "The result isn't clear yet."));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't check the result.");
    } finally {
      setChecking(false);
    }
  }

  const backersOf = (option: number) => people.filter((p) => p.pick === option);
  const votesFor = (option: number) => people.filter((p) => p.vote === option).length;
  const winning = stage === "settled" ? pact.winningOption : stage === "proposed" || stage === "finalizable" ? pact.proposedOption : undefined;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <Card className="relative overflow-hidden">
        <div className="bg-brand absolute -right-16 -top-16 size-48 rounded-full opacity-20 blur-3xl" aria-hidden />
        <div className="flex flex-wrap items-center gap-2">
          <StageBadge stage={stage} />
          <Badge>{pact.aiResolved ? <><Bot className="size-3" /> AI checked</> : "Decided by agreement"}</Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold leading-tight sm:text-3xl">{pact.terms}</h1>
        <div className="mt-5 grid grid-cols-3 gap-3 text-center">
          <Stat label="Pot" value={`$${formatUsdc(pact.pot, { compact: true })}`} />
          <Stat label="Stake" value={`$${formatUsdc(pact.stake, { compact: true })}`} />
          <Stat label="People" value={`${pact.participantCount}/${pact.maxParticipants}`} />
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted">
          {stage === "joining" && <span>Joining closes in {formatCountdown(pact.joinDeadline, now)}</span>}
          {["deciding", "disputed"].includes(stage) && <span>Refunds open in {formatCountdown(pact.resolveBy, now)} if unresolved</span>}
          {stage === "proposed" && <span>Objection window closes in {formatCountdown(pact.proposedAt + pact.challengeWindow, now)}</span>}
          <button onClick={() => setShareOpen(true)} className="ml-auto inline-flex items-center gap-1 font-medium text-accent">
            <Share2 className="size-3.5" /> Invite
          </button>
        </div>
      </Card>

      {/* AI proposal */}
      {(stage === "proposed" || stage === "finalizable") && (
        <Card className="border-accent/40">
          <div className="flex items-start gap-3">
            <span className="bg-brand flex size-10 shrink-0 items-center justify-center rounded-xl text-accent-fg">
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                Result: {pact.proposedOption === 0 ? "Void — everyone refunded" : pact.options[pact.proposedOption - 1]}
              </p>
              {pact.proposalSource && <SourceText text={pact.proposalSource} />}
              <p className="mt-2 text-xs text-muted">
                {stage === "proposed" ? "If this is wrong, anyone in the pact can object. The pact then needs everyone to agree." : "No objections. Anyone can release the payout now."}
              </p>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            {stage === "proposed" && joined && (
              <Button variant="danger" loading={tx.busy} onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "dispute", args: [pact.id] }, { pending: "Objecting…", success: "Objection recorded" }).catch(() => {})}>
                <ShieldAlert className="size-4" /> Object
              </Button>
            )}
            {stage === "finalizable" && isConnected && (
              <Button loading={tx.busy} onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "finalize", args: [pact.id] }, { pending: "Releasing payout…", success: "Pact settled" }).then(celebrate).catch(() => {})}>
                Release payout
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Outcomes */}
      <Card>
        <p className="mb-3 font-semibold">{stage === "joining" && !joined ? "Pick your side" : "Outcomes"}</p>
        <ul className="space-y-2">
          {pact.options.map((label, i) => {
            const option = i + 1;
            const backers = backersOf(option);
            const selectable = (stage === "joining" && !joined) || canVote;
            const selected = choice === option;
            const isWinner = winning === option;
            return (
              <li key={i}>
                <button
                  disabled={!selectable}
                  onClick={() => setChoice(option)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition",
                    selected ? "border-accent bg-accent/10" : "border-border",
                    selectable && !selected && "hover:border-accent/40",
                    isWinner && "border-success/60 bg-success/10",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium">
                      {label}
                      {me?.pick === option && <Badge tone="accent">Your pick</Badge>}
                      {isWinner && stage === "settled" && <CheckCircle2 className="size-4 text-success" />}
                    </p>
                    {canVote && <p className="mt-0.5 text-xs text-muted">{votesFor(option)} of {pact.participantCount} confirmed</p>}
                  </div>
                  <div className="flex -space-x-2">
                    {backers.slice(0, 5).map((b) => (
                      <span key={b.addr} className="rounded-full ring-2 ring-surface" title={shortAddress(b.addr)}>
                        <Avatar seed={b.addr} size={28} />
                      </span>
                    ))}
                    {backers.length > 5 && <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-[10px] ring-2 ring-surface">+{backers.length - 5}</span>}
                  </div>
                </button>
              </li>
            );
          })}
          {canVote && (
            <li>
              <button
                onClick={() => setChoice(0)}
                className={cn("w-full rounded-2xl border border-dashed p-3 text-sm text-muted transition", choice === 0 ? "border-accent text-fg" : "border-border hover:text-fg")}
              >
                Call it off: refund everyone ({votesFor(0)} of {pact.participantCount})
              </button>
            </li>
          )}
        </ul>

        <div className="mt-5 space-y-2">
          {!isConnected ? (
            <div className="flex justify-center">
              <ConnectButton size="lg" label="Connect to join" />
            </div>
          ) : stage === "joining" && !joined ? (
            <>
              <Button
                size="lg"
                disabled={!choice || (balance !== undefined && balance < pact.stake)}
                loading={tx.busy}
                onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "join", args: [pact.id, choice!] }, { spend: pact.stake, pending: "Locking your stake…", success: "You're in!" }).then(celebrate).catch(() => {})}
              >
                {tx.step === "approving" ? "Approving USDC…" : choice ? `Join for $${formatUsdc(pact.stake)}` : "Pick an outcome"}
              </Button>
              {balance !== undefined && balance < pact.stake && (
                <p className="text-center text-xs text-muted">
                  You need ${formatUsdc(pact.stake)} to join.{" "}
                  <Link href="/fund" className="text-accent hover:underline">
                    Add money
                  </Link>
                </p>
              )}
            </>
          ) : canVote ? (
            <>
              {pact.aiResolved && stage === "deciding" && aiAvailable !== false && (
                <Button size="lg" variant="secondary" loading={checking} onClick={checkWithAi}>
                  <Bot className="size-4" /> {checking ? "Searching for the result…" : "Check result with AI"}
                </Button>
              )}
              {aiNote && (
                <p className="flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm text-muted">
                  <Info className="mt-0.5 size-4 shrink-0" /> {aiNote}
                </p>
              )}
              <Button
                size="lg"
                variant={pact.aiResolved && stage === "deciding" ? "ghost" : "primary"}
                disabled={choice === undefined || choice === me?.vote}
                loading={tx.busy}
                onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "vote", args: [pact.id, choice!] }, { pending: "Confirming…", success: "Confirmed" }).catch(() => {})}
              >
                {me?.vote !== undefined ? "Change my confirmation" : "Confirm this result"}
              </Button>
              <p className="text-center text-xs text-muted">Pays out as soon as everyone confirms the same result.</p>
            </>
          ) : stage === "joining" && joined ? (
            <Button size="lg" onClick={() => setShareOpen(true)}>
              <Share2 className="size-4" /> Invite friends
            </Button>
          ) : stage === "refundable" ? (
            <Button size="lg" loading={tx.busy} onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "refund", args: [pact.id] }, { pending: "Opening refunds…", success: "Refunds open" }).catch(() => {})}>
              Open refunds
            </Button>
          ) : null}

          {me && me.claimable > 0n && (
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <Button
                size="lg"
                loading={tx.busy}
                onClick={() => run({ address: PACTS, abi: pactsAbi, functionName: "claim", args: [pact.id] }, { pending: "Claiming…", success: `Claimed $${formatUsdc(me.claimable)}` }).then(celebrate).catch(() => {})}
              >
                {stage === "refunded" ? "Claim refund" : "Claim winnings"} · ${formatUsdc(me.claimable)}
              </Button>
            </motion.div>
          )}
          {me?.claimed && <p className="text-center text-sm text-success">You&apos;ve claimed your share.</p>}
        </div>
      </Card>

      <ChatPanel pactId={pact.id} address={address} canChat={joined} />

      {/* People */}
      <Card>
        <p className="mb-3 font-semibold">People</p>
        <ul className="space-y-2">
          {people.map((p) => (
            <li key={p.addr} className="flex items-center gap-3">
              <Avatar seed={p.addr} size={32} />
              <span className="tabular flex-1 text-sm">
                {shortAddress(p.addr)}
                {p.addr.toLowerCase() === address?.toLowerCase() && <span className="text-muted"> (you)</span>}
                {p.addr === pact.creator && <span className="text-muted"> · creator</span>}
              </span>
              <span className="text-sm text-muted">{p.pick ? pact.options[p.pick - 1] : ""}</span>
            </li>
          ))}
        </ul>
      </Card>

      <p className="flex items-center justify-center gap-1.5 pb-4 text-center text-xs text-muted">
        Funds are held by the Pacts contract.
        <a href={`${chainExplorer()}/address/${PACTS}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent">
          View contract <ExternalLink className="size-3" />
        </a>
      </p>

      <Sheet open={shareOpen} onClose={() => setShareOpen(false)} title="Invite to this pact">
        <ShareLink url={url} title="Join my pact on Payeer" text={`${pact.terms} — $${formatUsdc(pact.stake)} each. Pick your side:`} />
      </Sheet>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 p-3">
      <p className="tabular text-xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function SourceText({ text }: { text: string }) {
  const match = text.match(/https?:\/\/\S+/);
  const summary = match ? text.replace(match[0], "").trim() : text;
  return (
    <p className="mt-1 text-sm text-muted">
      {summary}{" "}
      {match && (
        <a href={match[0]} target="_blank" rel="noreferrer nofollow" className="inline-flex items-center gap-1 text-accent">
          Source <ExternalLink className="size-3" />
        </a>
      )}
    </p>
  );
}

function chainExplorer() {
  return chain.blockExplorers?.default.url ?? "";
}

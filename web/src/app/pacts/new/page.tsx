"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Bot, Minus, Plus, Trophy, Dumbbell, PenLine, Users, X } from "lucide-react";
import { useState } from "react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@/components/connect";
import { AmountInput, Button, Card, Field, Input, PageHeader, Segmented } from "@/components/ui";
import { useResolverAvailable } from "@/hooks/use-resolver";
import { useTx } from "@/hooks/use-tx";
import { pactsAbi } from "@/lib/abi";
import { PACTS } from "@/lib/config";
import { cn, formatUsdc, parseUsdc } from "@/lib/format";
import { pactIdFrom } from "@/lib/requests";

type Template = "match" | "challenge" | "custom";

const templates: Record<Template, { label: string; icon: typeof Trophy; terms: string; options: string[]; ai: boolean; placeholder: string }> = {
  match: {
    label: "Match result",
    icon: Trophy,
    terms: "",
    options: ["Home team wins", "Away team wins", "Draw"],
    ai: true,
    placeholder: "PSG vs Manchester United, Champions League, 21 Oct 2026 (90 minutes)",
  },
  challenge: {
    label: "Challenge",
    icon: Dumbbell,
    terms: "",
    options: ["I do it", "I don't"],
    ai: false,
    placeholder: "I run a sub-25 minute 5K before 1 November",
  },
  custom: {
    label: "Custom",
    icon: PenLine,
    terms: "",
    options: ["Yes", "No"],
    ai: false,
    placeholder: "Describe exactly what everyone is agreeing to",
  },
};

const joinPresets = [
  { value: "1h", label: "1 hour", seconds: 3600 },
  { value: "1d", label: "1 day", seconds: 86400 },
  { value: "3d", label: "3 days", seconds: 3 * 86400 },
  { value: "7d", label: "1 week", seconds: 7 * 86400 },
] as const;

const TEXT_LIMIT = 500;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function NewPactPage() {
  const router = useRouter();
  const { isConnected } = useConnection();
  const tx = useTx();
  const [template, setTemplate] = useState<Template>("match");
  const [terms, setTerms] = useState("");
  const [options, setOptions] = useState(templates.match.options);
  const [pick, setPick] = useState(0);
  const [stake, setStake] = useState("");
  const [maxPeople, setMaxPeople] = useState(2);
  const [joinBy, setJoinBy] = useState<(typeof joinPresets)[number]["value"]>("1d");
  const [settleBy, setSettleBy] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86400_000)));
  const [ai, setAi] = useState(true);
  const [mountedAt] = useState(nowSeconds);
  const aiAvailable = useResolverAvailable();

  function chooseTemplate(t: Template) {
    setTemplate(t);
    setOptions(templates[t].options);
    setAi(templates[t].ai && aiAvailable !== false);
    setPick(0);
  }

  const stakeAmount = parseUsdc(stake);
  const joinSeconds = joinPresets.find((p) => p.value === joinBy)!.seconds;
  const joinDeadline = mountedAt + joinSeconds;
  const resolveBy = Math.floor(new Date(settleBy).getTime() / 1000);
  const cleanOptions = options.map((o) => o.trim());
  const textLength = new TextEncoder().encode(terms.trim() + cleanOptions.join("")).length;

  const problems = [
    !terms.trim() && "Describe the pact.",
    cleanOptions.some((o) => !o) && "Fill in every outcome.",
    new Set(cleanOptions.map((o) => o.toLowerCase())).size !== cleanOptions.length && "Outcomes must be different.",
    !stakeAmount && "Enter a stake.",
    textLength > TEXT_LIMIT && "Terms and outcomes are too long.",
    !(resolveBy >= joinDeadline) && "The settle-by date must be after joining closes.",
    resolveBy > mountedAt + 365 * 86400 && "Settle within a year.",
  ].filter(Boolean) as string[];

  async function create() {
    // Recompute at submit time: the form may have been open for a while.
    const deadline = nowSeconds() + joinSeconds;
    const receipt = await tx.send(
      {
        address: PACTS,
        abi: pactsAbi,
        functionName: "createPact",
        args: [
          {
            stake: stakeAmount!,
            joinDeadline: deadline,
            resolveBy,
            maxParticipants: maxPeople,
            aiResolved: ai,
            challengeWindow: ai ? 86400 : 0,
            pick: pick + 1,
            terms: terms.trim(),
            options: cleanOptions,
          },
        ],
      },
      { spend: stakeAmount, pending: "Locking your stake…", success: "Pact created" },
    );
    router.push(`/pacts/${pactIdFrom(receipt)}?new=1`);
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="New pact" subtitle="Everyone stakes the same amount. Backers of the winning outcome split the pot." />

      <Card className="space-y-7">
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(templates) as Template[]).map((t) => {
            const T = templates[t];
            return (
              <button
                key={t}
                onClick={() => chooseTemplate(t)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-3 text-sm font-medium transition",
                  template === t ? "border-accent bg-accent/10 text-fg" : "border-border text-muted hover:text-fg",
                )}
              >
                <T.icon className="size-5" /> {T.label}
              </button>
            );
          })}
        </div>

        <Field label="What's the pact?" hint={template === "match" ? "Name the teams, competition and date so the result can be checked." : undefined}>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder={templates[template].placeholder}
            rows={2}
            className="w-full resize-none rounded-2xl border border-border bg-surface-2/60 px-4 py-3 text-[15px] outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15"
          />
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">Outcomes · tap yours</p>
          <AnimatePresence initial={false}>
            {options.map((o, i) => (
              <motion.div key={i} layout initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className="flex items-center gap-2">
                <button
                  onClick={() => setPick(i)}
                  aria-label={`Pick outcome ${i + 1}`}
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold transition",
                    pick === i ? "bg-brand border-transparent text-accent-fg" : "border-border text-muted",
                  )}
                >
                  {pick === i ? "Me" : i + 1}
                </button>
                <Input value={o} maxLength={80} onChange={(e) => setOptions((xs) => xs.map((x, j) => (j === i ? e.target.value : x)))} />
                {options.length > 2 && (
                  <button
                    onClick={() => {
                      setOptions((xs) => xs.filter((_, j) => j !== i));
                      setPick((p) => (p === i ? 0 : p > i ? p - 1 : p));
                    }}
                    className="rounded-full p-2 text-muted hover:bg-surface-2 hover:text-fg"
                    aria-label="Remove outcome"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          {options.length < 8 && (
            <Button size="sm" variant="ghost" onClick={() => setOptions((xs) => [...xs, ""])}>
              <Plus className="size-4" /> Add outcome
            </Button>
          )}
        </div>

        <div>
          <p className="text-sm font-medium">Stake per person</p>
          <AmountInput value={stake} onChange={setStake} />
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-surface-2/60 p-4">
          <span className="flex items-center gap-3 text-sm font-medium">
            <Users className="size-5 text-muted" /> Max people
          </span>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" className="w-9 px-0" onClick={() => setMaxPeople((n) => Math.max(2, n - 1))} aria-label="Fewer">
              <Minus className="size-4" />
            </Button>
            <span className="tabular w-6 text-center text-lg font-semibold">{maxPeople}</span>
            <Button size="sm" variant="secondary" className="w-9 px-0" onClick={() => setMaxPeople((n) => Math.min(20, n + 1))} aria-label="More">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <Field label="Joining closes in">
          <Segmented value={joinBy} onChange={setJoinBy} options={joinPresets.map(({ value, label }) => ({ value, label }))} />
        </Field>

        <Field label="Settle by" hint="If no result is agreed by then, everyone can take their stake back.">
          <Input type="datetime-local" value={settleBy} onChange={(e) => setSettleBy(e.target.value)} />
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium">How is it decided?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                value: true,
                icon: Bot,
                title: "AI checks the result",
                body:
                  aiAvailable === false
                    ? "Not set up on this deployment yet — settle by agreement instead."
                    : "For public events. The result is posted with a source, and anyone in the pact can object within 24 hours.",
              },
              { value: false, icon: Users, title: "Everyone agrees", body: "For private challenges. It pays out once every participant confirms the same outcome." },
            ].map((m) => (
              <button
                key={String(m.value)}
                disabled={m.value === true && aiAvailable === false}
                onClick={() => setAi(m.value)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition disabled:opacity-50",
                  ai === m.value ? "border-accent bg-accent/10" : "border-border hover:border-accent/40",
                )}
              >
                <m.icon className={cn("mb-2 size-5", ai === m.value ? "text-accent" : "text-muted")} />
                <p className="font-medium">{m.title}</p>
                <p className="mt-1 text-xs text-muted">{m.body}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted">You lock now</span>
            <span className="tabular font-medium">${formatUsdc(stakeAmount ?? 0n)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted">Pot if full</span>
            <span className="tabular font-medium">${formatUsdc((stakeAmount ?? 0n) * BigInt(maxPeople))}</span>
          </div>
        </div>

        {isConnected ? (
          <div className="space-y-2">
            <Button size="lg" disabled={problems.length > 0} loading={tx.busy} onClick={() => create().catch(() => {})}>
              {tx.step === "approving" ? "Approving USDC…" : tx.step === "confirming" ? "Creating pact…" : "Create pact & lock stake"}
            </Button>
            {problems[0] && (terms || stake) && <p className="text-center text-xs text-muted">{problems[0]}</p>}
          </div>
        ) : (
          <div className="flex justify-center">
            <ConnectButton size="lg" label="Connect to create" />
          </div>
        )}
      </Card>
    </div>
  );
}

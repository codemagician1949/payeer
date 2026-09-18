"use client";

import { AnimatePresence, motion } from "motion/react";
import { Divide, Link2, Plus, QrCode, RotateCcw, Shuffle, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useConnection } from "wagmi";
import { ConnectButton } from "@/components/connect";
import { Sheet } from "@/components/sheet";
import { ShareLink } from "@/components/share-link";
import { AmountInput, Avatar, Button, Card, Input, PageHeader } from "@/components/ui";
import { secureRandomIndex, Wheel, type WheelHandle } from "@/components/wheel";
import { newRoomCode } from "@/hooks/use-spin-room";
import { useTx } from "@/hooks/use-tx";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { payUrl, requestIdFrom } from "@/lib/requests";

const MAX_NAMES = 12;
const STORAGE_KEY = "payeer:spin-names";

function weekFromNow() {
  return Math.floor(Date.now() / 1000) + 7 * 86400;
}

function shuffle<T>(xs: T[]) {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = secureRandomIndex(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function useTick(enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);
  return () => {
    if (!enabled) return;
    try {
      ctx.current ??= new AudioContext();
      const ac = ctx.current;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.frequency.value = 1400;
      gain.gain.setValueAtTime(0.05, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.04);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + 0.05);
    } catch {}
  };
}

export default function SpinPage() {
  const router = useRouter();
  const { isConnected } = useConnection();
  const wheel = useRef<WheelHandle>(null);
  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [bill, setBill] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<number>();
  const [sound, setSound] = useState(true);
  const [link, setLink] = useState<{ id: bigint; label: string }>();
  const tick = useTick(sound);
  const tx = useTx();

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      // Loaded after mount on purpose: reading storage during render would break hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(saved)) setNames(saved.filter((x) => typeof x === "string").slice(0, MAX_NAMES));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    } catch {}
  }, [names]);

  function addName() {
    const n = draft.trim().slice(0, 24);
    if (!n || names.length >= MAX_NAMES) return;
    setNames((xs) => [...xs, n]);
    setDraft("");
  }

  async function spin() {
    if (names.length < 2 || spinning) return;
    setWinner(undefined);
    setSpinning(true);
    const idx = secureRandomIndex(names.length);
    await wheel.current?.spin(idx);
    setSpinning(false);
    setWinner(idx);
    navigator.vibrate?.(80);
    celebrate();
  }

  const billAmount = parseUsdc(bill);
  const share = billAmount && names.length ? billAmount / BigInt(names.length) : undefined;

  async function createLink(mode: "loser" | "split") {
    if (!billAmount || winner === undefined) return;
    const who = names[winner];
    const amount = mode === "loser" ? billAmount : share!;
    const memo = mode === "loser" ? `${who} got spun — pays the bill` : `Bill split ${names.length} ways`;
    const receipt = await tx.send(
      { address: PAYEER, abi: payeerAbi, functionName: "createRequest", args: [amount, weekFromNow(), mode === "split", memo] },
      { pending: "Creating payment link…", success: "Link ready to share" },
    );
    setLink({ id: requestIdFrom(receipt), label: mode === "loser" ? `Send this to ${who}` : "Send this to the group" });
    setWinner(undefined);
    tx.reset();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div>
        <PageHeader
          title="Who pays?"
          subtitle="Add everyone at the table and let the wheel decide. Fair, random, final."
          action={
            <button onClick={() => setSound((s) => !s)} className="rounded-full p-2.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label={sound ? "Mute" : "Unmute"}>
              {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
            </button>
          }
        />
        <div className="relative py-4">
          <Wheel ref={wheel} names={names.length ? names : ["Add", "names", "to", "spin"]} onTick={spinning ? tick : undefined} />
        </div>
        <div className="mx-auto mt-4 max-w-[380px] space-y-2">
          <Button size="lg" onClick={spin} disabled={names.length < 2} loading={spinning} className="h-16 text-lg">
            {spinning ? "Spinning…" : names.length < 2 ? "Add at least 2 names" : "Spin the wheel"}
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => router.push(`/spin/${newRoomCode()}`)}>
            <QrCode className="size-4" /> Everyone on their own phone
          </Button>
          <p className="text-center text-xs text-muted">Opens a room others can scan into. They see the same wheel and result.</p>
        </div>
      </div>

      <Card className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-medium">People ({names.length}/{MAX_NAMES})</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addName();
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a name" disabled={names.length >= MAX_NAMES || spinning} />
            <Button type="submit" variant="secondary" className="h-12 w-12 shrink-0 px-0" disabled={!draft.trim() || spinning} aria-label="Add name">
              <Plus className="size-5" />
            </Button>
          </form>
          <ul className="mt-3 flex flex-wrap gap-2">
            <AnimatePresence initial={false}>
              {names.map((n, i) => (
                <motion.li
                  key={`${n}-${i}`}
                  layout
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-surface-2/60 py-1 pl-1 pr-1.5 text-sm"
                >
                  <Avatar seed={n} label={n} size={24} />
                  {n}
                  <button
                    disabled={spinning}
                    onClick={() => setNames((xs) => xs.filter((_, j) => j !== i))}
                    className="rounded-full p-0.5 text-muted hover:bg-border hover:text-fg"
                    aria-label={`Remove ${n}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {names.length > 1 && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="ghost" disabled={spinning} onClick={() => setNames(shuffle)}>
                <Shuffle className="size-4" /> Shuffle
              </Button>
              <Button size="sm" variant="ghost" disabled={spinning} onClick={() => setNames([])}>
                <RotateCcw className="size-4" /> Clear
              </Button>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4">
          <p className="text-sm font-medium">Bill total (optional)</p>
          <AmountInput value={bill} onChange={setBill} placeholder="0" />
          {share && names.length > 1 && <p className="-mt-2 text-center text-xs text-muted">or ${formatUsdc(share)} each if you split</p>}
        </div>
      </Card>

      <Sheet open={winner !== undefined} onClose={() => setWinner(undefined)} title="The wheel has spoken">
        {winner !== undefined && (
          <div className="text-center">
            <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mx-auto w-fit">
              <Avatar seed={names[winner]} label={names[winner]} size={88} />
            </motion.div>
            <p className="mt-4 text-3xl font-semibold">{names[winner]} pays!</p>
            {billAmount && <p className="tabular mt-1 text-muted">${formatUsdc(billAmount)} bill</p>}

            <div className="mt-6 space-y-2">
              {billAmount ? (
                isConnected ? (
                  <>
                    <Button size="lg" loading={tx.busy} onClick={() => createLink("loser").catch(() => {})}>
                      <Link2 className="size-4" /> Request ${formatUsdc(billAmount)} from {names[winner]}
                    </Button>
                    <Button variant="secondary" className="w-full" disabled={tx.busy} onClick={() => createLink("split").catch(() => {})}>
                      <Divide className="size-4" /> Split evenly instead (${formatUsdc(share)} each)
                    </Button>
                  </>
                ) : (
                  <div className="flex justify-center">
                    <ConnectButton size="lg" label="Connect to request payment" />
                  </div>
                )
              ) : (
                <p className="text-sm text-muted">Add the bill total to turn this into a payment link.</p>
              )}
              <Button variant="ghost" className="w-full" disabled={tx.busy} onClick={() => { setWinner(undefined); setTimeout(spin, 250); }}>
                <RotateCcw className="size-4" /> Spin again
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={!!link} onClose={() => setLink(undefined)} title={link?.label ?? ""}>
        {link && <ShareLink url={payUrl(link.id)} title="Pay the bill" text="The wheel has spoken. Pay here:" />}
      </Sheet>
    </div>
  );
}

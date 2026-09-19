"use client";

import { useParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Divide, Link2, MessageCircle, QrCode, RotateCcw, Send, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useConfig } from "wagmi";
import { useActiveAccount } from "@/hooks/use-account";
import { ConnectButton } from "@/components/connect";
import { Sheet } from "@/components/sheet";
import { FairnessNote } from "@/components/fairness-note";
import { SendMoney } from "@/components/send-money";
import { ShareLink } from "@/components/share-link";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { AmountInput, Avatar, Button, Card, Input, Skeleton } from "@/components/ui";
import { Wheel, type WheelHandle } from "@/components/wheel";
import { useSpinRoom } from "@/hooks/use-spin-room";
import { useTx } from "@/hooks/use-tx";
import { payeerAbi } from "@/lib/abi";
import { PAYEER } from "@/lib/config";
import { celebrate } from "@/lib/confetti";
import { drawWinner, isFutureRound, type Draw } from "@/lib/fairness";
import { cn, formatUsdc, parseUsdc } from "@/lib/format";
import { countRequests, newRequestId, payUrl } from "@/lib/requests";

const NAME_KEY = "payeer:display-name";

function weekFromNow() {
  return Math.floor(Date.now() / 1000) + 7 * 86400;
}

export default function SpinRoomPage() {
  const params = useParams<{ code: string }>();
  const code = params.code?.toUpperCase();
  const [name, setName] = useState<string>();
  const [draftName, setDraftName] = useState("");
  const [nameAsked, setNameAsked] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(NAME_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setName(saved);
    } catch {}
    setNameAsked(true);
  }, []);

  if (!nameAsked) return <Skeleton className="mx-auto h-96 max-w-md rounded-3xl" />;

  if (!name) {
    return (
      <div className="mx-auto max-w-sm pt-10">
        <Card className="text-center">
          <Users className="mx-auto mb-3 size-10 text-accent" />
          <h1 className="text-2xl font-semibold">Join the room</h1>
          <p className="mt-1 text-sm text-muted">Room {code} · what should everyone call you?</p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const clean = draftName.trim().slice(0, 24);
              if (!clean) return;
              try {
                localStorage.setItem(NAME_KEY, clean);
              } catch {}
              setName(clean);
            }}
          >
            <Input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder="Your name" autoFocus maxLength={24} />
            <Button size="lg" type="submit" disabled={!draftName.trim()}>
              Join
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted">No wallet needed to play. You only need one if you end up paying.</p>
        </Card>
      </div>
    );
  }

  return <Room code={code} name={name} />;
}

function Room({ code, name }: { code: string; name: string }) {
  const room = useSpinRoom(code, name);
  const config = useConfig();
  const { address, isConnected } = useActiveAccount();
  const wheel = useRef<WheelHandle>(null);
  const tx = useTx();
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string>();
  const [draw, setDraw] = useState<Draw>();
  const [draft, setDraft] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [link, setLink] = useState<{ id: bigint; label: string }>();
  const bottom = useRef<HTMLDivElement>(null);
  const lastSpinAt = useRef(0);

  // Every screen works out the winner itself from the announced beacon round, so all of them
  // agree without trusting the server — and the server can't know the answer in advance either.
  useEffect(() => {
    const event = room.spin;
    if (!event || event.at === lastSpinAt.current) return;
    lastSpinAt.current = event.at;
    setResult(undefined);
    setDraw(undefined);
    setSpinning(true);
    wheel.current?.start();

    (async () => {
      // Refuse a round that has already happened: that's how a tampered server would cheat.
      if (!(await isFutureRound(event.round))) throw new Error("That spin used an old round, so it was ignored.");
      const outcome = await drawWinner(event.round, `spin:${code}`, event.names);
      await wheel.current?.land(outcome.winner);
      setDraw(outcome);
      setResult(event.names[outcome.winner]);
      navigator.vibrate?.(80);
      celebrate();
    })()
      .catch((err) => toast.error(err instanceof Error ? err.message : "The spin couldn't finish."))
      .finally(() => setSpinning(false));
  }, [room.spin, code]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [room.messages.length]);

  // Share where to pay me, so whoever the wheel picks can send it in one tap.
  useEffect(() => {
    if (room.status === "ready" && address && room.addresses[name] !== address) room.sendRoom({ address });
  }, [room.status, address, name, room]);

  const billAmount = parseUsdc(room.bill);
  // Whoever fronted the bill: the room's host, if they've shared an address.
  const payTo = room.host && room.host !== name && room.addresses[room.host]
    ? { name: room.host, address: room.addresses[room.host] }
    : undefined;
  const share = billAmount && room.names.length ? billAmount / BigInt(room.names.length) : undefined;
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/spin/${code}`;

  async function createLink(mode: "loser" | "split") {
    if (!billAmount || !result) return;
    const amount = mode === "loser" ? billAmount : share!;
    const memo = mode === "loser" ? `${result} got spun — pays the bill` : `Bill split ${room.names.length} ways`;
    const before = await countRequests(config, address!);
    const receipt = await tx.send(
      { address: PAYEER, abi: payeerAbi, functionName: "createRequest", args: [amount, weekFromNow(), mode === "split", memo] },
      { pending: "Creating payment link…", success: "Link ready to share" },
    );
    setLink({ id: await newRequestId(config, receipt, address!, before), label: mode === "loser" ? `Send this to ${result}` : "Send this to the group" });
    setResult(undefined);
    tx.reset();
  }

  if (!room.available) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="font-medium">Rooms need the chat server</p>
        <p className="mt-1 text-sm text-muted">Start it with <code className="font-mono">pnpm chat</code>, then reload.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Room {code}</h1>
            <p className="mt-0.5 text-sm text-muted">
              {room.status === "ready" ? `${room.people.length} here · ${room.names.length} on the wheel` : "Connecting…"}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setInviteOpen(true)}>
            <QrCode className="size-4" /> Invite
          </Button>
        </div>

        <Wheel ref={wheel} names={room.names.length ? room.names : ["Waiting", "for", "people", "to join"]} />

        <div className="mx-auto mt-4 max-w-[380px] space-y-2">
          <Button size="lg" className="h-16 text-lg" disabled={room.names.length < 2 || spinning} loading={spinning} onClick={room.requestSpin}>
            {spinning ? "Waiting for the randomness beacon…" : room.names.length < 2 ? "Waiting for one more person" : "Spin for everyone"}
          </Button>
          <p className="text-center text-xs text-muted">
            Anyone can spin. The result comes from a public randomness beacon, so no one here — or running this app — can rig it.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <Card className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium">In the room</p>
            <ul className="flex flex-wrap gap-2">
              {room.names.map((n) => (
                <li key={n} className={cn("flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm", room.people.includes(n) ? "border-accent/40 bg-accent/10" : "border-border bg-surface-2/60")}>
                  <Avatar seed={n} label={n} size={24} />
                  {n}
                  {n === name && <span className="text-xs text-muted">(you)</span>}
                </li>
              ))}
            </ul>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">Bill total</p>
            <AmountInput value={room.bill} onChange={(v) => room.sendRoom({ bill: v })} placeholder="0" />
            {share && room.names.length > 1 && <p className="-mt-2 text-center text-xs text-muted">${formatUsdc(share)} each if you split</p>}
          </div>
        </Card>

        <Card className="p-0">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <MessageCircle className="size-4 text-muted" />
            <p className="flex-1 text-sm font-semibold">Room chat</p>
          </div>
          <ScrollArea className="h-64">
            <ul className="space-y-3 p-4">
              <AnimatePresence initial={false}>
                {room.messages.map((m) => {
                  const mine = m.from === name;
                  const ai = m.from === "assistant";
                  return (
                    <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
                      <Avatar seed={m.from} label={ai ? "AI" : m.from} size={24} />
                      <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm", mine ? "bg-brand text-accent-fg" : ai ? "bg-accent/10" : "bg-surface-2")}>
                        {!mine && <p className="mb-0.5 text-[11px] font-medium text-muted">{ai ? "Payeer helper" : m.from}</p>}
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {room.assistantTyping && <li className="pl-8 text-xs text-muted">the helper is thinking…</li>}
              <div ref={bottom} />
            </ul>
          </ScrollArea>
          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim()) return;
              room.sendMessage(draft.trim());
              setDraft("");
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Say something, or /ask…" maxLength={1000} />
            <Button type="submit" className="w-12 shrink-0 px-0" disabled={!draft.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </Card>
      </div>

      <Sheet open={!!result} onClose={() => setResult(undefined)} title="The wheel has spoken">
        {result && (
          <div className="text-center">
            <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 260, damping: 14 }} className="mx-auto w-fit">
              <Avatar seed={result} label={result} size={88} />
            </motion.div>
            <p className="mt-4 text-3xl font-semibold">{result === name ? "You pay!" : `${result} pays!`}</p>
            {billAmount && <p className="tabular mt-1 text-muted">${formatUsdc(billAmount)} bill</p>}
            {draw && <FairnessNote draw={draw} />}
            <div className="mt-6 space-y-2">
              {billAmount && result === name && payTo ? (
                <>
                  {isConnected ? (
                    <SendMoney
                      amount={billAmount}
                      to={payTo.address}
                      toName={payTo.name}
                      memo={`Bill from room ${code}`}
                      onDone={() => setResult(undefined)}
                    />
                  ) : (
                    <div className="flex justify-center">
                      <ConnectButton size="lg" label="Connect to pay" />
                    </div>
                  )}
                  <p className="text-xs text-muted">Goes straight to {payTo.name}, settled on Arc in about a second.</p>
                </>
              ) : billAmount ? (
                isConnected ? (
                  <>
                    <Button size="lg" loading={tx.busy} onClick={() => createLink("loser").catch(() => {})}>
                      <Link2 className="size-4" /> Request ${formatUsdc(billAmount)} from {result}
                    </Button>
                    <Button variant="secondary" className="w-full" disabled={tx.busy} onClick={() => createLink("split").catch(() => {})}>
                      <Divide className="size-4" /> Split evenly (${formatUsdc(share)} each)
                    </Button>
                  </>
                ) : (
                  <div className="flex justify-center">
                    <ConnectButton size="lg" label="Connect to send a payment link" />
                  </div>
                )
              ) : (
                <p className="text-sm text-muted">Add the bill total to turn this into a payment link.</p>
              )}
              <Button variant="ghost" className="w-full" onClick={() => { setResult(undefined); room.requestSpin(); }}>
                <RotateCcw className="size-4" /> Spin again
              </Button>
            </div>
          </div>
        )}
      </Sheet>

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={`Invite to room ${code}`}>
        <ShareLink url={url} title="Join my Payeer room" text="Scan to join the spin — no wallet needed." />
        <p className="mt-4 text-center text-sm text-muted">
          Or tell them the code: <span className="font-mono text-lg font-semibold text-fg">{code}</span>
        </p>
      </Sheet>

      <Sheet open={!!link} onClose={() => setLink(undefined)} title={link?.label ?? ""}>
        {link && <ShareLink url={payUrl(link.id)} title="Pay the bill" text="The wheel has spoken. Pay here:" />}
      </Sheet>

      {room.error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-danger/12 px-4 py-2 text-sm text-danger">
          {room.error}
          <button onClick={() => location.reload()} className="ml-2 underline">
            retry
          </button>
          <X className="ml-1 inline size-3" />
        </div>
      )}
    </div>
  );
}

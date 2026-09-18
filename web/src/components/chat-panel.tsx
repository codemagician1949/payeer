"use client";

import { AnimatePresence, motion } from "motion/react";
import { MessageCircle, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Avatar, Button, Card, Input } from "./ui";
import { ScrollArea } from "./shadcn/scroll-area";
import { cn, shortAddress } from "@/lib/format";
import { useChat } from "@/hooks/use-chat";

export function ChatPanel({ pactId, address, canChat }: { pactId: bigint; address: Address | undefined; canChat: boolean }) {
  const room = `pact:${pactId}`;
  const chat = useChat(room, address, canChat);
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages.length, chat.assistantTyping]);

  if (!chat.available) return null;

  return (
    <Card className="p-0">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <MessageCircle className="size-4 text-muted" />
        <p className="flex-1 font-semibold">Group chat</p>
        {chat.status === "ready" && (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            {chat.people.length} here
          </span>
        )}
      </div>

      {chat.status !== "ready" ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-muted">
            {!canChat
              ? "Join this pact to chat with everyone in it."
              : "Chat privately with the people in this pact. Ask the helper anything by starting a message with /ask."}
          </p>
          {chat.error && <p className="mt-2 text-sm text-danger">{chat.error}</p>}
          {canChat && (
            <Button
              className="mt-4"
              variant="secondary"
              loading={chat.status === "signing" || chat.status === "connecting"}
              onClick={() => chat.connect()}
            >
              {chat.status === "signing" ? "Check your wallet…" : chat.status === "error" ? "Try again" : "Open chat"}
            </Button>
          )}
          {canChat && chat.status === "idle" && (
            <p className="mt-2 text-xs text-muted">You&apos;ll sign a message to prove it&apos;s you. It&apos;s free and moves no money.</p>
          )}
        </div>
      ) : (
        <>
          <ScrollArea className="h-80">
            <ul className="space-y-3 p-4">
              <AnimatePresence initial={false}>
                {chat.messages.map((m) => {
                  const mine = m.from.toLowerCase() === address?.toLowerCase();
                  const ai = m.from === "assistant";
                  return (
                    <motion.li
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn("flex items-end gap-2", mine && "flex-row-reverse")}
                    >
                      {ai ? (
                        <span className="bg-brand flex size-7 shrink-0 items-center justify-center rounded-full text-accent-fg">
                          <Sparkles className="size-3.5" />
                        </span>
                      ) : (
                        <Avatar seed={m.from} size={28} />
                      )}
                      <div className={cn("max-w-[78%] rounded-2xl px-3.5 py-2", mine ? "bg-brand text-accent-fg" : ai ? "bg-accent/10" : "bg-surface-2")}>
                        {!mine && (
                          <p className={cn("mb-0.5 text-[11px] font-medium", ai ? "text-accent" : "text-muted")}>
                            {ai ? "Payeer helper" : shortAddress(m.from)}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
                      </div>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
              {chat.assistantTyping && (
                <li className="flex items-center gap-2 pl-9 text-xs text-muted">
                  <Sparkles className="size-3 animate-pulse text-accent" /> the helper is thinking…
                </li>
              )}
              {chat.typing.length > 0 && <li className="pl-9 text-xs text-muted">{shortAddress(chat.typing[0])} is typing…</li>}
              <div ref={bottom} />
            </ul>
          </ScrollArea>

          <form
            className="flex gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const text = draft.trim();
              if (!text) return;
              chat.send(text);
              setDraft("");
            }}
          >
            <Input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                chat.notifyTyping();
              }}
              placeholder="Message, or /ask the helper…"
              maxLength={1000}
            />
            <Button type="submit" className="w-12 shrink-0 px-0" disabled={!draft.trim()} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

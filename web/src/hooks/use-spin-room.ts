"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "./use-chat";
import { pickFutureRound } from "@/lib/fairness";

const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL;

export type SpinEvent = { round: number; names: string[]; by: string; at: number };
type Status = "idle" | "connecting" | "ready" | "error";

/**
 * A shared spinner session. Anyone with the room code can join by name — no wallet needed,
 * because nothing is at stake until someone turns the result into a payment link.
 * The server picks the winner so every screen lands on the same person.
 */
export function useSpinRoom(code: string | undefined, name: string | undefined) {
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [bill, setBill] = useState("");
  const [host, setHost] = useState<string>();
  const [addresses, setAddresses] = useState<Record<string, `0x${string}`>>({});
  const [people, setPeople] = useState<string[]>([]);
  const [spin, setSpin] = useState<SpinEvent>();
  const [assistantTyping, setAssistantTyping] = useState(false);

  useEffect(() => {
    if (!code || !name || !CHAT_URL || socket.current) return;
    setStatus("connecting");
    const room = `spin:${code}`;
    const ws = new WebSocket(CHAT_URL);
    socket.current = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "join-spin", room, name }));
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ready") {
        setError(undefined);
        setMessages(data.messages ?? []);
        setNames(data.names ?? []);
        setBill(data.bill ?? "");
        setHost(data.host);
        setAddresses(data.addresses ?? {});
        setStatus("ready");
      } else if (data.type === "room") {
        setNames(data.names ?? []);
        setBill(data.bill ?? "");
        setHost(data.host);
        setAddresses(data.addresses ?? {});
      } else if (data.type === "spin") {
        setSpin({ round: data.round, names: data.names ?? [], by: data.by, at: Date.now() });
      } else if (data.type === "msg") {
        setAssistantTyping(false);
        setMessages((xs) => (xs.some((m) => m.id === data.message.id) ? xs : [...xs, data.message]));
      } else if (data.type === "assistant-typing") {
        setAssistantTyping(true);
      } else if (data.type === "presence") {
        setPeople(data.people ?? []);
      } else if (data.type === "error") {
        setError(data.error);
        setStatus("error");
      }
    };
    ws.onerror = () => {
      // Ignore a socket that has already been replaced (React remounts effects in development).
      if (socket.current !== ws) return;
      setError("Couldn't reach the room. Is the chat server running?");
      setStatus("error");
    };
    ws.onclose = () => {
      // A previous socket closing must not disown the one that replaced it.
      if (socket.current !== ws) return;
      socket.current = null;
      setStatus((s) => (s === "error" ? s : "idle"));
    };

    return () => {
      ws.close();
      if (socket.current === ws) socket.current = null;
    };
  }, [code, name]);

  const sendRoom = useCallback((update: { names?: string[]; bill?: string; address?: string }) => {
    socket.current?.send(JSON.stringify({ type: "room", ...update }));
  }, []);

  /** The round is chosen from the public beacon's clock, and every client checks it's still ahead. */
  const requestSpin = useCallback(async () => {
    const round = await pickFutureRound();
    socket.current?.send(JSON.stringify({ type: "spin", round }));
  }, []);

  const sendMessage = useCallback((text: string) => {
    socket.current?.send(JSON.stringify({ type: "msg", text }));
  }, []);

  return { status, error, messages, names, bill, host, addresses, people, spin, assistantTyping, sendRoom, requestSpin, sendMessage, available: !!CHAT_URL };
}

/** Short, unambiguous room codes: no O/0/I/1 to misread over a table. */
export function newRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { useSignMessage } from "wagmi";

export type ChatMessage = { id: string; from: Address | "assistant"; text: string; at: number };
type Status = "idle" | "signing" | "connecting" | "ready" | "error";

const CHAT_URL = process.env.NEXT_PUBLIC_CHAT_URL;

/** Mirrors the server's template exactly; both sides must agree byte for byte. */
function signInMessage(room: string, issuedAt: number) {
  return `Payeer chat\nRoom: ${room}\nSigned at: ${new Date(issuedAt).toISOString()}\n\nSigning proves this wallet is yours. It costs nothing and authorises no payment.`;
}

export function useChat(room: string | undefined, address: Address | undefined, enabled: boolean) {
  const { signMessageAsync } = useSignMessage();
  const socket = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [people, setPeople] = useState<Address[]>([]);
  const [assistantTyping, setAssistantTyping] = useState(false);
  const [typing, setTyping] = useState<Address[]>([]);

  const disconnect = useCallback(() => {
    socket.current?.close();
    socket.current = null;
    setStatus("idle");
  }, []);

  const connect = useCallback(async () => {
    if (!room || !address || !CHAT_URL || socket.current) return;
    setError(undefined);
    try {
      setStatus("signing");
      const issuedAt = Date.now();
      const signature = await signMessageAsync({ message: signInMessage(room, issuedAt) });

      setStatus("connecting");
      const ws = new WebSocket(CHAT_URL);
      socket.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ type: "hello", room, address, issuedAt, signature }));
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "ready") {
          setMessages(data.messages ?? []);
          setStatus("ready");
        } else if (data.type === "msg") {
          setAssistantTyping(false);
          setMessages((xs) => (xs.some((m) => m.id === data.message.id) ? xs : [...xs, data.message]));
        } else if (data.type === "presence") {
          setPeople(data.people ?? []);
        } else if (data.type === "assistant-typing") {
          setAssistantTyping(true);
        } else if (data.type === "typing") {
          setTyping((xs) => (xs.includes(data.from) ? xs : [...xs, data.from]));
          setTimeout(() => setTyping((xs) => xs.filter((a) => a !== data.from)), 2500);
        } else if (data.type === "error") {
          setError(data.error);
          setStatus("error");
        }
      };
      ws.onerror = () => {
        setError("Couldn't reach the chat server.");
        setStatus("error");
      };
      ws.onclose = () => {
        socket.current = null;
        setStatus((s) => (s === "error" ? s : "idle"));
      };
    } catch (e) {
      setError(e instanceof Error && e.message.includes("rejected") ? "You cancelled the signature." : "Couldn't sign in to chat.");
      setStatus("error");
    }
  }, [room, address, signMessageAsync]);

  useEffect(() => {
    // Closing the socket when chat is hidden also resets status; that's the point, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) disconnect();
    return () => {
      socket.current?.close();
      socket.current = null;
    };
  }, [enabled, disconnect]);

  const send = useCallback((text: string) => {
    socket.current?.send(JSON.stringify({ type: "msg", text }));
  }, []);

  const notifyTyping = useCallback(() => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: "typing" }));
  }, []);

  return { status, error, messages, people, typing, assistantTyping, connect, disconnect, send, notifyTyping, available: !!CHAT_URL };
}

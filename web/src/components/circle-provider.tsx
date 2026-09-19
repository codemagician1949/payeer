"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Address } from "viem";

type Sdk = import("@circle-fin/w3s-pw-web-sdk").W3SSdk;

export type CircleSession = {
  userToken: string;
  encryptionKey: string;
  walletId: string;
  address: Address;
};

type CircleState = {
  /** Whether this deployment can offer Circle email sign-in at all. */
  available: boolean;
  /** Configured, but the Circle key covers a different network than the app is on. */
  wrongNetwork: boolean;
  session?: CircleSession;
  busy: boolean;
  signIn: (email: string) => Promise<void>;
  signOut: () => void;
  /** Runs a contract call through Circle: creates a challenge, then asks for the PIN. */
  execute: (call: { contractAddress: string; abiFunctionSignature: string; abiParameters: unknown[] }) => Promise<void>;
};

const Context = createContext<CircleState | null>(null);
const STORAGE_KEY = "payeer:circle-session";

export function useCircle() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useCircle must be used inside CircleProvider");
  return ctx;
}

export function CircleProvider({ children }: { children: ReactNode }) {
  const [available, setAvailable] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [session, setSession] = useState<CircleSession>();
  const [busy, setBusy] = useState(false);
  const [sdk, setSdk] = useState<Sdk>();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/circle/config")
      .then((r) => r.json())
      .then((c) => {
        if (cancelled) return;
        setAvailable(!!c.available);
        setWrongNetwork(!!c.configured && !c.matchesApp);
      })
      .catch(() => {});
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setSession(JSON.parse(saved));
    } catch {}
    return () => {
      cancelled = true;
    };
  }, []);

  /** Circle's SDK touches the DOM, so it is only loaded in the browser, and only when needed. */
  const loadSdk = useCallback(async () => {
    if (sdk) return sdk;
    const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
    const instance = new W3SSdk({
      appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "" },
    });
    setSdk(instance);
    return instance;
  }, [sdk]);

  const persist = useCallback((next?: CircleSession) => {
    setSession(next);
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const signIn = useCallback(
    async (email: string) => {
      setBusy(true);
      try {
        const instance = await loadSdk();
        const deviceId = await instance.getDeviceId();

        const res = await fetch("/api/circle/email-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, deviceId }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't send the code.");

        // Circle's own UI collects the emailed code and returns the session credentials.
        const auth = await new Promise<{ userToken: string; encryptionKey: string }>((resolve, reject) => {
          instance.updateConfigs(
            {
              appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "" },
              loginConfigs: {
                deviceToken: body.deviceToken,
                deviceEncryptionKey: body.deviceEncryptionKey,
                otpToken: body.otpToken,
              },
            },
            (error, result) => {
              if (error || !result) return reject(new Error(error?.message ?? "Sign-in was cancelled."));
              resolve({ userToken: result.userToken, encryptionKey: result.encryptionKey });
            },
          );
          instance.verifyOtp();
        });

        instance.setAuthentication(auth);

        // Create the Arc wallet if this is their first time.
        const init = await fetch("/api/circle/initialize", {
          method: "POST",
          headers: { "x-user-token": auth.userToken },
        }).then((r) => r.json());
        if (init.challengeId) {
          await new Promise<void>((resolve, reject) => {
            instance.execute(init.challengeId, (error) => (error ? reject(new Error(error.message)) : resolve()));
          });
        }

        const { wallet } = await fetch("/api/circle/wallet", { headers: { "x-user-token": auth.userToken } }).then((r) =>
          r.json(),
        );
        if (!wallet?.address) throw new Error("Circle didn't return a wallet.");

        persist({ ...auth, walletId: wallet.id, address: wallet.address as Address });
      } finally {
        setBusy(false);
      }
    },
    [loadSdk, persist],
  );

  const execute = useCallback(
    async (call: { contractAddress: string; abiFunctionSignature: string; abiParameters: unknown[] }) => {
      if (!session) throw new Error("Sign in first.");
      const instance = await loadSdk();
      instance.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });

      const res = await fetch("/api/circle/execute", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-token": session.userToken },
        body: JSON.stringify({ ...call, walletId: session.walletId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't prepare that transaction.");

      await new Promise<void>((resolve, reject) => {
        instance.execute(body.challengeId, (error) => (error ? reject(new Error(error.message)) : resolve()));
      });
    },
    [loadSdk, session],
  );

  const value = useMemo<CircleState>(
    () => ({ available, wrongNetwork, session, busy, signIn, signOut: () => persist(undefined), execute }),
    [available, wrongNetwork, session, busy, signIn, persist, execute],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

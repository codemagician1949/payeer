import "server-only";
import { chain } from "./config";

/**
 * Circle's Programmable Wallets, called through Circle's own REST API — no third-party SDK
 * sits between Payeer and Circle for anything Circle provides.
 *
 * A Circle key is scoped to either testnets or mainnets, so the wallet network follows the key.
 */
const API = "https://api.circle.com/v1/w3s";

export function circleKey() {
  return process.env.CIRCLE_API_KEY ?? "";
}

/** Circle's chain identifier for Arc, matching whichever key is configured. */
export function circleBlockchain() {
  return circleKey().startsWith("TEST_API_KEY") ? "ARC-TESTNET" : "ARC";
}

/** Circle can only sign for the network its key covers; anything else would mislead people. */
export function circleMatchesApp() {
  const wanted = chain.id === 5042 ? "ARC" : "ARC-TESTNET";
  return circleBlockchain() === wanted;
}

export function circleAvailable() {
  return !!circleKey() && !!process.env.NEXT_PUBLIC_CIRCLE_APP_ID && circleMatchesApp();
}

type CircleRequest = {
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
  userToken?: string;
};

export async function circleFetch<T>({ path, method = "GET", body, userToken }: CircleRequest): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${circleKey()}`,
      "content-type": "application/json",
      ...(userToken ? { "X-User-Token": userToken } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (json as { message?: string }).message ?? `Circle returned ${res.status}`;
    throw new CircleError(message, (json as { code?: number }).code, res.status);
  }
  return (json as { data: T }).data;
}

export class CircleError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Circle's "already initialized" response is a success for our purposes. */
export const ALREADY_INITIALIZED = 155106;

export function idempotencyKey() {
  return crypto.randomUUID();
}

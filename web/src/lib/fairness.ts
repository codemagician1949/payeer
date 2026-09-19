"use client";

import { fetchBeacon, HttpCachingChain, HttpChainClient, roundAt, roundTime } from "drand-client";
import { keccak256, toBytes, concat } from "viem";

/**
 * Where the spinner's randomness comes from, and why nobody can rig it.
 *
 * drand's quicknet is a public randomness beacon run by the League of Entropy: a threshold of
 * independent organisations jointly sign a value every 3 seconds, and no participant — nor
 * Payeer, nor whoever is holding the phone — can predict or influence it. Each beacon is a
 * BLS signature that anyone can verify against the network's public key, which this client does
 * on every fetch.
 *
 * A spin names a round that hasn't happened yet, so the outcome cannot be known when the wheel
 * starts. Clients refuse a round whose time has already passed, which stops a tampered server
 * from replaying a beacon it already knows.
 */
const CHAIN_HASH = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
/** quicknet's group public key, pinned so a substituted relay can't pass off its own chain. */
const PUBLIC_KEY =
  "83cf0f2896adee7eb8b5f01fcad3912212c437e0073e911fb90022d3e760183c8c4b450b6a0a6c3ac6a5776a2d1064510d1fec758c921cc22b0e17e63aaf4bcb5ed66304de9cf809bd274ca73bab4af5a6e9c76a4bc09e76eae8991ef5ece45a";
// The client speaks drand's v1 API, whose /info carries the fields it verifies against.
const CHAIN_URL = `https://api.drand.sh/${CHAIN_HASH}`;
const OPTIONS = {
  disableBeaconVerification: false,
  noCache: false,
  chainVerificationParams: { chainHash: CHAIN_HASH, publicKey: PUBLIC_KEY },
};

/** How far ahead a spin reaches, in milliseconds: enough that the round can't already exist. */
export const LOOKAHEAD_MS = 9000;

let chain: HttpCachingChain | undefined;
let client: HttpChainClient | undefined;

function drand() {
  chain ??= new HttpCachingChain(CHAIN_URL, OPTIONS);
  client ??= new HttpChainClient(chain, OPTIONS);
  return { chain, client };
}

export type Draw = { round: number; randomness: string; winner: number; verifyUrl: string };

/** The round a spin starting now should settle on. */
export async function pickFutureRound(): Promise<number> {
  const info = await drand().chain.info();
  return roundAt(Date.now() + LOOKAHEAD_MS, info);
}

/** Rejects a round that is already decided — the check that makes a dishonest server useless. */
export async function isFutureRound(round: number, toleranceMs = 1500) {
  const info = await drand().chain.info();
  return roundTime(info, round) > Date.now() - toleranceMs;
}

/** Waits for the round, verifies its signature, and returns its randomness. */
export async function awaitRound(round: number): Promise<string> {
  const { chain: c, client: cl } = drand();
  const info = await c.info();
  const readyAt = roundTime(info, round);
  const wait = readyAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait + 400));

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      // fetchBeacon verifies the BLS signature against quicknet's public key.
      const beacon = await fetchBeacon(cl, round);
      if (beacon?.randomness) return beacon.randomness;
    } catch {
      // The relay may not have published it yet.
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("Couldn't reach the randomness beacon. Check your connection and spin again.");
}

/**
 * Turns public randomness into a winner. Everyone with the same round and the same list gets the
 * same answer, and can check it by hand: keccak256(randomness ‖ room ‖ names) mod count.
 */
export function winnerFrom(randomness: string, room: string, names: string[]) {
  const digest = keccak256(concat([toBytes(`0x${randomness}`), toBytes(`${room}\n${names.join("\n")}`)]));
  return Number(BigInt(digest) % BigInt(names.length));
}

export function verifyUrl(round: number) {
  return `${CHAIN_URL}/public/${round}`;
}

/** One spin, end to end: wait for the named round, verify it, and work out who pays. */
export async function drawWinner(round: number, room: string, names: string[]): Promise<Draw> {
  const randomness = await awaitRound(round);
  return { round, randomness, winner: winnerFrom(randomness, room, names), verifyUrl: verifyUrl(round) };
}

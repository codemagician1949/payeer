import { arbitrum, base, mainnet, optimism } from "viem/chains";
import type { Address, Chain } from "viem";

/**
 * Circle's Cross-Chain Transfer Protocol (V2): USDC is burned on the source chain and minted
 * on Arc, so people can move money they already hold instead of buying a new token.
 * Addresses verified against developers.circle.com and on-chain.
 */
export const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d" as Address;
export const MESSAGE_TRANSMITTER = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64" as Address;
export const ARC_DOMAIN = 26;

/** Below 1000 is treated as 1000 (fast, small fee); above as 2000 (free, waits for finality). */
export const FAST = 1000;
export const STANDARD = 2000;

export type SourceChain = {
  chain: Chain;
  domain: number;
  usdc: Address;
  label: string;
  /** Rough wait for the standard (free) route, for setting expectations. */
  standardWait: string;
};

export const sources: SourceChain[] = [
  { chain: base, domain: 6, usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", label: "Base", standardWait: "~15 min" },
  { chain: arbitrum, domain: 3, usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", label: "Arbitrum", standardWait: "~15 min" },
  { chain: optimism, domain: 10, usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", label: "Optimism", standardWait: "~15 min" },
  { chain: mainnet, domain: 0, usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", label: "Ethereum", standardWait: "~20 min" },
];

export const tokenMessengerAbi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [],
  },
] as const;

export const messageTransmitterAbi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

const IRIS = "https://iris-api.circle.com";

export type Fees = { finalityThreshold: number; minimumFee: number }[];

/** Fee is quoted in basis points of the amount. */
export async function fetchFees(sourceDomain: number): Promise<Fees> {
  const res = await fetch(`${IRIS}/v2/burn/USDC/fees/${sourceDomain}/${ARC_DOMAIN}`);
  if (!res.ok) throw new Error("Couldn't fetch transfer fees.");
  return res.json();
}

export function feeFor(amount: bigint, bps: number) {
  // Round up so maxFee always covers Circle's quote.
  return (amount * BigInt(Math.ceil(bps * 100)) + 999_999n) / 1_000_000n;
}

export type Attestation = { status: string; message: `0x${string}`; attestation: `0x${string}` };

/** Polls Circle until the burn is attested. Resolves when the mint can be claimed on Arc. */
export async function waitForAttestation(sourceDomain: number, txHash: string, signal?: AbortSignal): Promise<Attestation> {
  for (let attempt = 0; attempt < 240; attempt++) {
    if (signal?.aborted) throw new Error("Cancelled.");
    const res = await fetch(`${IRIS}/v2/messages/${sourceDomain}?transactionHash=${txHash}`, { signal });
    if (res.ok) {
      const body = await res.json();
      const message = body.messages?.[0];
      if (message?.status === "complete" && message.attestation && message.attestation !== "PENDING") {
        return message as Attestation;
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Circle is taking longer than usual. Your funds are safe — reopen this page to finish.");
}

export function toBytes32(address: Address): `0x${string}` {
  return `0x${"0".repeat(24)}${address.slice(2)}` as `0x${string}`;
}

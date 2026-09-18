import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./config";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsdc(value: bigint | undefined, opts: { compact?: boolean } = {}) {
  if (value === undefined) return "—";
  const n = Number(formatUnits(value, USDC_DECIMALS));
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: opts.compact && Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: n !== 0 && Math.abs(n) < 0.01 ? 6 : 2,
  }).format(n);
}

/** Parses user input like "12.5" into 6-decimal units. Returns undefined when invalid or zero. */
export function parseUsdc(input: string): bigint | undefined {
  const clean = input.replace(/,/g, "").trim();
  if (!/^\d*\.?\d{0,6}$/.test(clean) || clean === "" || clean === ".") return undefined;
  const v = parseUnits(clean, USDC_DECIMALS);
  return v > 0n ? v : undefined;
}

export function shortAddress(address?: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function relativeTime(unixSeconds: number, now = Date.now() / 1000) {
  const diff = unixSeconds - now;
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** Deterministic two-stop gradient for an address or name, used as a lightweight avatar. */
export function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const a = h % 360;
  const b = (a + 40 + (h % 80)) % 360;
  return `linear-gradient(135deg, oklch(0.72 0.16 ${a}), oklch(0.58 0.18 ${b}))`;
}

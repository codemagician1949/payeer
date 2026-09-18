import type { Metadata } from "next";
import { createPublicClient, http } from "viem";
import { payeerAbi } from "@/lib/abi";
import { chain, PAYEER } from "@/lib/config";
import { formatUsdc, shortAddress } from "@/lib/format";

/** Chat apps show this when someone shares a payment link, so read the real amount and note. */
export async function generateMetadata({ params }: LayoutProps<"/pay/[id]">): Promise<Metadata> {
  const { id } = await params;
  const fallback = { title: "Payment request", description: "Pay in USDC on Arc." };
  if (!/^\d{1,18}$/.test(id)) return fallback;

  try {
    const client = createPublicClient({ chain, transport: http() });
    const [request, memo] = await Promise.all([
      client.readContract({ address: PAYEER, abi: payeerAbi, functionName: "requests", args: [BigInt(id)] }),
      client.readContract({ address: PAYEER, abi: payeerAbi, functionName: "memoOf", args: [BigInt(id)] }),
    ]);
    const [creator, amount] = request;
    if (creator === "0x0000000000000000000000000000000000000000") return fallback;

    const title = amount > 0n ? `Pay $${formatUsdc(amount)} USDC` : "Payment request";
    const description = `${memo ? `${memo} · ` : ""}Requested by ${shortAddress(creator)}. Pay in one tap on Arc.`;
    return { title, description, openGraph: { title: `${title} · Payeer`, description }, twitter: { card: "summary", title, description } };
  } catch {
    return fallback;
  }
}

export default function PayLayout({ children }: LayoutProps<"/pay/[id]">) {
  return children;
}

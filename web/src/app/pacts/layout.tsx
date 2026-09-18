import type { Metadata } from "next";

export const metadata: Metadata = { title: "Pacts", description: "Group escrow in USDC with friends, settled by agreement or by an AI-checked result." };

export default function Layout({ children }: LayoutProps<"/pacts">) {
  return children;
}

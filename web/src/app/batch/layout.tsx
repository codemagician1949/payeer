import type { Metadata } from "next";

export const metadata: Metadata = { title: "Batch payout", description: "Pay a whole team in a single transaction." };

export default function Layout({ children }: LayoutProps<"/batch">) {
  return children;
}

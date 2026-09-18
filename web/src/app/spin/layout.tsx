import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bill spinner", description: "Spin to decide who pays the bill, then send them a payment link." };

export default function Layout({ children }: LayoutProps<"/spin">) {
  return children;
}

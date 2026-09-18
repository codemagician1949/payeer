import type { Metadata } from "next";

export const metadata: Metadata = { title: "Add money", description: "Move USDC from another network onto Arc." };

export default function Layout({ children }: LayoutProps<"/fund">) {
  return children;
}

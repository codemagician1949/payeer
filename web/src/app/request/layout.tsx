import type { Metadata } from "next";

export const metadata: Metadata = { title: "Request money", description: "Create a USDC payment link anyone can pay in one tap." };

export default function Layout({ children }: LayoutProps<"/request">) {
  return children;
}

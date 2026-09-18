import type { Metadata } from "next";

export const metadata: Metadata = { title: "Activity", description: "Your payments on Arc." };

export default function Layout({ children }: LayoutProps<"/activity">) {
  return children;
}

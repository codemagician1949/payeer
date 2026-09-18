import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { cookieToInitialState } from "wagmi";
import { Providers } from "@/components/providers";
import { Shell } from "@/components/shell";
import { makeWagmiConfig } from "@/lib/wagmi";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Payeer — get paid in USDC with a link", template: "%s · Payeer" },
  description: "Payment links, bill spinner and friendly escrow on Arc. Fees in USDC, no other token needed.",
  applicationName: "Payeer",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0f0f17" },
    { media: "(prefers-color-scheme: light)", color: "#f9f9fc" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Runs before paint so the saved theme never flashes. Dark is the default.
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem("theme")||"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const initialState = cookieToInitialState(makeWagmiConfig(), (await headers()).get("cookie"));

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers initialState={initialState}>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}

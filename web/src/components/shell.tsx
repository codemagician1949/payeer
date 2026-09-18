"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Activity, Handshake, Home, Moon, Plus, Send, Sun, Disc3 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ConnectButton } from "./connect";
import { cn } from "@/lib/format";
import { isLocal, chain } from "@/lib/config";

const nav = [
  { href: "/", label: "Home", icon: Home },
  { href: "/request", label: "Request", icon: Send },
  { href: "/spin", label: "Spin", icon: Disc3 },
  { href: "/pacts", label: "Pacts", icon: Handshake },
  { href: "/activity", label: "Activity", icon: Activity },
];

const desktopOnly = [{ href: "/fund", label: "Add money", icon: Plus }];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Public payment pages stay focused: no app navigation.
  const minimal = pathname.startsWith("/pay/");

  return (
    <div className="aurora flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo />
            <span className="text-lg">Payeer</span>
            {chain.testnet || isLocal ? (
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-semibold uppercase text-warn">{isLocal ? "Local" : "Testnet"}</span>
            ) : null}
          </Link>
          {!minimal && (
            <nav className="hidden items-center gap-1 md:flex">
              {[...nav.slice(1), ...desktopOnly].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                    isActive(pathname, item.href) ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {isActive(pathname, item.href) && (
                    <motion.span layoutId="nav-pill" className="absolute inset-0 -z-10 rounded-full bg-surface-2" />
                  )}
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full max-w-5xl flex-1 px-4 pt-6 sm:pt-10", minimal ? "pb-10" : "pb-28 md:pb-12")}>{children}</main>

      {!minimal && (
        <nav className="fixed inset-x-3 bottom-3 z-40 rounded-3xl border border-border/70 bg-surface/85 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-xl md:hidden">
          <ul className="grid grid-cols-5">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={cn("flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active ? "text-accent" : "text-muted")}>
                    <item.icon className="size-5" strokeWidth={active ? 2.4 : 1.8} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="pl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill="url(#pl)" />
      <path d="M11 23V9h6.2a4.8 4.8 0 0 1 0 9.6H11" fill="none" stroke="var(--accent-fg)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.5" cy="22.5" r="1.8" fill="var(--accent-fg)" />
    </svg>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  // The theme is applied by an inline script before paint; mirror it into state after mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTheme(document.documentElement.dataset.theme ?? "dark"), []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
  }

  return (
    <button onClick={toggle} className="rounded-full p-2.5 text-muted transition hover:bg-surface-2 hover:text-fg" aria-label="Toggle theme">
      {theme === "light" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}

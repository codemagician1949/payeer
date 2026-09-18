"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { Loader2 } from "lucide-react";
import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn, gradientFor } from "@/lib/format";

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  children?: ReactNode;
};

export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,opacity,box-shadow] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50 disabled:pointer-events-none select-none",
        size === "sm" && "h-9 px-4 text-sm",
        size === "md" && "h-11 px-5 text-[15px]",
        size === "lg" && "h-14 px-7 text-base w-full",
        variant === "primary" && "bg-brand text-accent-fg shadow-[0_8px_30px_-8px_var(--glow)] hover:opacity-95",
        variant === "secondary" && "bg-surface-2 text-fg hover:bg-border",
        variant === "ghost" && "text-muted hover:text-fg hover:bg-surface-2",
        variant === "danger" && "bg-danger/12 text-danger hover:bg-danger/20",
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </motion.button>
  );
}

export function Card({ className, children, ...rest }: HTMLMotionProps<"div"> & { children?: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-5 sm:p-6", className)}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-2xl border border-border bg-surface-2/60 px-4 text-[15px] text-fg placeholder:text-muted/70 outline-none transition focus:border-accent focus:bg-surface focus:ring-4 focus:ring-accent/15",
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Big centered amount entry, the focal point of money screens. */
export function AmountInput({
  value,
  onChange,
  autoFocus,
  placeholder = "0",
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-baseline justify-center gap-2 py-4">
      <span className="text-3xl font-medium text-muted">$</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value.replace(/[^\d.]/g, "");
          if (/^\d*\.?\d{0,6}$/.test(v)) onChange(v);
        }}
        size={Math.max(value.length, placeholder.length, 1)}
        className="tabular bg-transparent text-center text-6xl font-semibold tracking-tight text-fg outline-none placeholder:text-muted/40"
        aria-label="Amount in USDC"
      />
      <span className="text-lg font-medium text-muted">USDC</span>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="relative grid rounded-full bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("relative z-10 h-9 rounded-full text-sm font-medium transition-colors", value === o.value ? "text-fg" : "text-muted")}
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.value).join()}`}
              className="absolute inset-0 -z-10 rounded-full bg-surface shadow-sm"
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ seed, label, size = 40 }: { seed: string; label?: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: gradientFor(seed.toLowerCase()), fontSize: size * 0.4 }}
      aria-hidden
    >
      {label?.[0]?.toUpperCase()}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warn" | "danger" | "accent"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "success" && "bg-success/12 text-success",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "danger" && "bg-danger/12 text-danger",
        tone === "accent" && "bg-accent/12 text-accent",
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">{icon}</div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

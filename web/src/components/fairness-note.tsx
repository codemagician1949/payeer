"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import type { Draw } from "@/lib/fairness";

/**
 * Shows where the result came from, so anyone at the table can check it rather than take
 * Payeer's word for it.
 */
export function FairnessNote({ draw }: { draw: Draw }) {
  return (
    <div className="mt-3 rounded-2xl bg-surface-2/60 px-3 py-2 text-left">
      <p className="flex items-center gap-1.5 text-xs font-medium text-success">
        <ShieldCheck className="size-3.5" /> Drawn from public randomness
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        drand round <span className="tabular font-medium text-fg">#{draw.round}</span>, signed by the League of Entropy
        and verified on this device.{" "}
        <a href={draw.verifyUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-accent hover:underline">
          Check it yourself <ExternalLink className="size-2.5" />
        </a>
      </p>
    </div>
  );
}

"use client";

import { Bot, CheckCircle2, Clock, Gavel, RotateCcw, Scale, Users } from "lucide-react";
import type { PactStage } from "@/lib/pact-stage";
import { Badge } from "./ui";

const stageInfo: Record<PactStage, { label: string; tone: "accent" | "success" | "warn" | "danger" | "neutral"; icon: typeof Clock }> = {
  joining: { label: "Open to join", tone: "accent", icon: Users },
  deciding: { label: "Awaiting result", tone: "warn", icon: Scale },
  proposed: { label: "Result proposed", tone: "accent", icon: Bot },
  finalizable: { label: "Ready to pay out", tone: "success", icon: Gavel },
  disputed: { label: "Disputed", tone: "danger", icon: Scale },
  refundable: { label: "Refund available", tone: "warn", icon: RotateCcw },
  settled: { label: "Settled", tone: "success", icon: CheckCircle2 },
  refunded: { label: "Refunded", tone: "neutral", icon: RotateCcw },
};

export function StageBadge({ stage }: { stage: PactStage }) {
  const info = stageInfo[stage];
  return (
    <Badge tone={info.tone}>
      <info.icon className="size-3" /> {info.label}
    </Badge>
  );
}

/** Live countdown text for a unix deadline. */
export function formatCountdown(target: number, now: number) {
  const s = Math.max(0, Math.floor(target - now));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

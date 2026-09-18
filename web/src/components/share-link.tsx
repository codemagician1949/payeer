"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "./ui";

export function ShareLink({ url, title, text }: { url: string; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="space-y-5">
      <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow-lg">
        <QRCodeSVG value={url} size={196} level="M" marginSize={0} fgColor="#111118" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2/60 p-1.5 pl-4">
        <span className="min-w-0 flex-1 truncate text-sm text-muted">{url.replace(/^https?:\/\//, "")}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {canShare && (
        <Button size="lg" onClick={() => navigator.share({ title, text, url }).catch(() => {})}>
          <Share2 className="size-4" /> Share link
        </Button>
      )}
    </div>
  );
}

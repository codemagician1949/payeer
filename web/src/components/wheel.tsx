"use client";

import { animate, motion, useMotionValue, useMotionValueEvent, useTransform } from "motion/react";
import { forwardRef, useImperativeHandle, useRef } from "react";

const palette = [
  "oklch(0.66 0.19 280)",
  "oklch(0.72 0.14 225)",
  "oklch(0.76 0.15 160)",
  "oklch(0.8 0.15 85)",
  "oklch(0.7 0.19 30)",
  "oklch(0.68 0.2 340)",
  "oklch(0.62 0.17 255)",
  "oklch(0.74 0.16 195)",
];

export type WheelHandle = {
  /** Spins without a destination, while the randomness beacon is still being waited on. */
  start: () => void;
  /** Decelerates into the winning slice once the beacon has been verified. */
  land: (winner: number) => Promise<void>;
};

/** Cryptographically random integer in [0, max). */
export function secureRandomIndex(max: number) {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max; // rejection sampling avoids modulo bias
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

function polar(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)] as const;
}

function slicePath(i: number, n: number) {
  const a0 = (360 / n) * i;
  const a1 = a0 + 360 / n;
  const [x0, y0] = polar(96, a0);
  const [x1, y1] = polar(96, a1);
  return `M100 100 L${x0} ${y0} A96 96 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1} Z`;
}

export const Wheel = forwardRef<WheelHandle, { names: string[]; onTick?: () => void }>(function Wheel({ names, onTick }, ref) {
  const rotation = useMotionValue(0);
  const pointerKick = useTransform(rotation, (r) => {
    // Nudge the pointer each time a slice boundary passes under it.
    const seg = 360 / Math.max(names.length, 1);
    const within = (((-r % seg) + seg) % seg) / seg;
    return within < 0.12 ? -18 * (1 - within / 0.12) : 0;
  });
  const lastSlice = useRef(0);
  const n = Math.max(names.length, 1);

  useMotionValueEvent(rotation, "change", (r) => {
    const slice = Math.floor(-r / (360 / n));
    if (slice !== lastSlice.current) {
      lastSlice.current = slice;
      onTick?.();
    }
  });

  const freeSpin = useRef<{ stop: () => void } | null>(null);

  useImperativeHandle(ref, () => ({
    start() {
      freeSpin.current?.stop();
      // Keep turning at a steady pace until the beacon arrives.
      const controls = animate(rotation, rotation.get() - 360 * 40, {
        duration: 40,
        ease: "linear",
      });
      freeSpin.current = controls;
    },
    async land(winner) {
      freeSpin.current?.stop();
      freeSpin.current = null;
      const seg = 360 / n;
      // Land somewhere inside the winning slice, not dead-centre, so it feels natural.
      const offset = (0.18 + (secureRandomIndex(1000) / 1000) * 0.64) * seg;
      const target = -(winner * seg + offset);
      const current = rotation.get();
      const base = current - (((current % 360) + 360) % 360);
      const final = base - 360 * (4 + secureRandomIndex(2)) + ((target % 360) + 360) % 360 - 360;
      // A long, decelerating tail: it creeps into the final slice rather than snapping to it.
      await animate(rotation, final, { duration: 6.4, ease: [0.1, 0.62, 0.1, 1] });
    },
  }));

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[380px]">
      <div className="absolute inset-0 rounded-full bg-accent/20 blur-3xl" aria-hidden />
      <motion.div
        className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2"
        style={{ rotate: pointerKick, transformOrigin: "50% 20%" }}
        aria-hidden
      >
        <svg width="34" height="42" viewBox="0 0 34 42">
          <path d="M17 42 L3 12 A15 15 0 1 1 31 12 Z" fill="var(--fg)" />
          <circle cx="17" cy="15" r="5" fill="var(--bg)" />
        </svg>
      </motion.div>
      <motion.svg viewBox="0 0 200 200" className="relative size-full drop-shadow-2xl" style={{ rotate: rotation }} role="img" aria-label="Bill spinner wheel">
        <circle cx="100" cy="100" r="99" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
        {names.length === 0 ? (
          <circle cx="100" cy="100" r="96" fill="var(--surface-2)" />
        ) : names.length === 1 ? (
          <circle cx="100" cy="100" r="96" fill={palette[0]} />
        ) : (
          names.map((_, i) => <path key={i} d={slicePath(i, n)} fill={palette[i % palette.length]} stroke="var(--surface)" strokeWidth="0.8" />)
        )}
        {names.map((name, i) => {
          const mid = (360 / n) * i + 180 / n;
          return (
            <g key={`${name}-${i}`} transform={`rotate(${mid - 90} 100 100)`}>
              <text
                x="170"
                y="100"
                textAnchor="end"
                dominantBaseline="central"
                fill="white"
                fontSize={n > 8 ? 7 : 9}
                fontWeight="600"
                style={{ paintOrder: "stroke", stroke: "rgb(0 0 0 / 0.15)", strokeWidth: 1.5 }}
              >
                {name.length > 12 ? `${name.slice(0, 11)}…` : name}
              </text>
            </g>
          );
        })}
        <circle cx="100" cy="100" r="16" fill="var(--surface)" stroke="var(--border)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="6" className="fill-accent" />
      </motion.svg>
    </div>
  );
});

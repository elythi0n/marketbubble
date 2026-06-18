"use client";

import { memo, useEffect, useRef } from "react";
import { useInView, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

// Adapted from https://ui.aceternity.com/components/background-beams.
// SMIL drives the gradient sweep so the browser interpolates natively — no JS rAF, no
// React updates per frame, ~free off the main thread compared to a motion-component loop.

const PATHS = Array.from({ length: 22 }, (_, i) => {
  const s = i * 38;
  return `M${-180 + s} -60C${-180 + s} -60 ${-110 + s} 90 ${10 + s} 158C${130 + s} 226 ${200 + s} 380 ${200 + s} 380`;
});

// Index-derived (not `Math.random`) so SSR + first client render produce the same schedule.
const SCHEDULES = PATHS.map((_, i) => ({
  duration: 10 + ((i * 1.73) % 10),
  delay: (i * 1.31) % 10,
}));

export const BackgroundBeams = memo(function BackgroundBeams({ className }: { className?: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const reduced = useReducedMotion();
  // `initial: true` skips the first-paint flash — first render is already in the animating branch.
  const inView = useInView(wrapperRef, { amount: 0, once: false, initial: true });

  // Native SVG timeline pause — halts every `<animate>` child at once when off-screen.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    if (inView) svg.unpauseAnimations();
    else svg.pauseAnimations();
  }, [inView]);

  return (
    <div ref={wrapperRef} className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {PATHS.map((d, i) => (
          <g key={`p-${i}`}>
            {/* Faint static rail — visible always, theme-aware via `--beam-rail`. The beam
                gradient stroke below rides on top. */}
            <path d={d} stroke="var(--beam-rail)" strokeWidth="0.45" fill="none" />
            <path d={d} stroke={`url(#beam-grad-${i})`} strokeOpacity="0.55" strokeWidth="0.6" fill="none" />
          </g>
        ))}
        <defs>
          {SCHEDULES.map(({ duration, delay }, i) => (
            // Source endpoints differ by branch: animated users start at a point gradient
            // (matches the `<animate>` start values → beams emerge from invisible), reduced-
            // motion users get a visible diagonal sweep as the static fallback.
            <linearGradient
              id={`beam-grad-${i}`}
              key={`g-${i}`}
              x1="0%"
              y1="0%"
              x2={reduced ? "100%" : "0%"}
              y2={reduced ? "100%" : "0%"}
            >
              {!reduced && (
                <>
                  <animate attributeName="x1" values="0%;100%" dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
                  <animate attributeName="x2" values="0%;95%" dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
                  <animate attributeName="y1" values="0%;100%" dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
                  <animate attributeName="y2" values="0%;94.2%" dur={`${duration}s`} begin={`${delay}s`} repeatCount="indefinite" />
                </>
              )}
              {/* CSS vars only resolve via `style`, not the bare `stop-color` attribute. */}
              <stop offset="0%" style={{ stopColor: "var(--beam-stop-a)" }} stopOpacity="0" />
              <stop offset="0%" style={{ stopColor: "var(--beam-stop-a)" }} />
              <stop offset="32.5%" style={{ stopColor: "var(--beam-stop-b)" }} />
              <stop offset="100%" style={{ stopColor: "var(--beam-stop-c)" }} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
      </svg>
    </div>
  );
});

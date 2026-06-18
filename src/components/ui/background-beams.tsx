"use client";

import { memo } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";

// Adapted from https://ui.aceternity.com/components/background-beams — animated SVG paths
// with each path's stroke fed by its own `linearGradient` whose endpoints sweep diagonally,
// so the bright gradient band travels along the curve.

// Paths fan diagonally across the 696×316 viewBox. Each beam enters above the top,
// passes through the middle, and exits below the bottom — so the visible portion is the
// long diagonal stroke, not a tiny corner clip.
const PATHS = Array.from({ length: 22 }, (_, i) => {
  const s = i * 38;
  return `M${-180 + s} -60C${-180 + s} -60 ${-110 + s} 90 ${10 + s} 158C${130 + s} 226 ${200 + s} 380 ${200 + s} 380`;
});

// Index-derived (not `Math.random()`) so the SSR + client render produce the same animation
// schedule — random would re-roll each mount and React would flag a hydration mismatch.
function scheduleFor(i: number) {
  return {
    duration: 10 + ((i * 1.73) % 10),
    delay: (i * 1.31) % 10,
  };
}

export const BackgroundBeams = memo(function BackgroundBeams({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 696 316"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {PATHS.map((d, i) => (
          <motion.path
            key={`p-${i}`}
            d={d}
            stroke={`url(#beam-grad-${i})`}
            strokeOpacity="0.55"
            strokeWidth="0.6"
          />
        ))}
        <defs>
          {PATHS.map((_, i) => {
            const { duration, delay } = scheduleFor(i);
            return (
              <motion.linearGradient
                id={`beam-grad-${i}`}
                key={`g-${i}`}
                initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
                animate={{
                  x1: ["0%", "100%"],
                  x2: ["0%", "95%"],
                  y1: ["0%", "100%"],
                  y2: ["0%", "94.2%"],
                }}
                transition={{
                  duration,
                  delay,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop",
                }}
              >
                {/* Stop colors come from CSS vars so the beams stay visible on the warm-paper
                    light floor as well as the graphite dark floor. `style` (not the attribute)
                    is what resolves `var(...)` for SVG paints. */}
                <stop style={{ stopColor: "var(--beam-stop-a)" }} stopOpacity="0" />
                <stop style={{ stopColor: "var(--beam-stop-a)" }} />
                <stop offset="32.5%" style={{ stopColor: "var(--beam-stop-b)" }} />
                <stop offset="100%" style={{ stopColor: "var(--beam-stop-c)" }} stopOpacity="0" />
              </motion.linearGradient>
            );
          })}
        </defs>
      </svg>
    </div>
  );
});

"use client";

import { cn } from "@/lib/utils";

// Adapted from https://ui.aceternity.com/components/dotted-glow-background.
// Two layers, both `pointer-events-none`:
//   1. A repeating radial-gradient dot grid, masked by a radial fall-off centered on
//      `glowAt` — so dots are full strength at the glow center and fade to invisible.
//   2. A soft color tint behind the dots so the area feels warmly lit, not just stippled.
//
// Colors are CSS vars (`--dot-glow-dot`, `--dot-glow-tint`) so the same component reads
// correctly on the warm-paper light theme and the graphite dark theme — see globals.css.

interface DottedGlowBackgroundProps {
  className?: string;
  /** Where the glow centers — any valid background-position. Defaults to the top edge. */
  glowAt?: string;
  /** Spacing between dots in px. Smaller = denser. */
  dotSize?: number;
  /** Glow radius as a percent of the container's diagonal. Bigger = softer falloff. */
  glowSpread?: number;
}

export function DottedGlowBackground({
  className,
  glowAt = "100% 50%",
  dotSize = 14,
  glowSpread = 85,
}: DottedGlowBackgroundProps) {
  // Ellipse stretched vertically (V-radius 150%) so in a wide-short header the falloff
  // reads as a clean horizontal fade from the `glowAt` anchor — by default, full strength
  // at the right edge fading to nothing on the left.
  const shape = `ellipse 100% 150% at ${glowAt}`;
  const mask = `radial-gradient(${shape}, black 0%, transparent ${glowSpread}%)`;
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      {/* Color tint — sits under the dots so the lit area has a faint hue, not just specks. */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(${shape}, var(--dot-glow-tint), transparent ${glowSpread}%)`,
        }}
      />
      {/* Dot grid, masked to fade with the same radial. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--dot-glow-dot) 1px, transparent 1.4px)",
          backgroundSize: `${dotSize}px ${dotSize}px`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    </div>
  );
}

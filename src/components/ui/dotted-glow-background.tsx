"use client";

import { cn } from "@/lib/utils";

// Adapted from https://ui.aceternity.com/components/dotted-glow-background. Theme-driven
// via `--dot-glow-dot` / `--dot-glow-tint` — see globals.css.

interface DottedGlowBackgroundProps {
  className?: string;
  /** Where the glow centers — any valid `background-position`. Defaults to the right edge. */
  glowAt?: string;
  /** Pitch of the dot grid in px (the `background-size` tile). Lower = denser grid. */
  dotSpacing?: number;
  /** Offset (in %) of the radial-gradient's transparent stop. Higher = softer, longer falloff. */
  glowSpread?: number;
}

export function DottedGlowBackground({
  className,
  glowAt = "100% 50%",
  dotSpacing = 14,
  glowSpread = 85,
}: DottedGlowBackgroundProps) {
  // Vertically-stretched so the falloff reads as a clean horizontal fade, not a circular spot.
  const shape = `ellipse 100% 150% at ${glowAt}`;
  const mask = `radial-gradient(${shape}, black 0%, transparent ${glowSpread}%)`;
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(${shape}, var(--dot-glow-tint), transparent ${glowSpread}%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(var(--dot-glow-dot) 1px, transparent 1.4px)",
          backgroundSize: `${dotSpacing}px ${dotSpacing}px`,
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      />
    </div>
  );
}

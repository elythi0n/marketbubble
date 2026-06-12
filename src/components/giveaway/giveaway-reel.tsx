"use client";

import { useEffect, useState } from "react";
import { PartyPopper } from "lucide-react";

import type { Giveaway } from "@/lib/server/control";
import { cn } from "@/lib/utils";

/**
 * The slot-machine roll, shared by the admin page and the OBS overlay. Everything derives from
 * the broadcast Giveaway (names order, winner, startedAt, durationMs), so every screen — opened
 * at any moment, even mid-roll or after the fact — renders the same frames and the same landing.
 *
 * The reel index follows floor(easeOutCubic(progress) · totalSteps) over a fixed number of full
 * loops plus the winner's offset: fast blur at the start, a crawl at the end, exact landing.
 */

const FULL_LOOPS = 6;
/** The reel finishes its travel here; the rest of the duration holds the winner centered, so
 *  the name everyone watched it land on IS the winner — no swap at the reveal. */
const ROLL_PORTION = 0.85;

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

/** Reel position for a moment in time; locked on the winner from ROLL_PORTION onward. */
function reelIndex(g: Giveaway, now: number): { index: number; rollProgress: number } {
  const progress = Math.min(1, Math.max(0, (now - g.startedAt) / g.durationMs));
  const rollProgress = Math.min(1, progress / ROLL_PORTION);
  const winnerIdx = Math.max(0, g.names.indexOf(g.winner));
  const totalSteps = g.names.length * FULL_LOOPS + winnerIdx;
  // round(), not floor(): at rollProgress = 1 this is exactly totalSteps → the winner's index.
  const index = Math.round(easeOutCubic(rollProgress) * totalSteps) % g.names.length;
  return { index, rollProgress };
}

export function GiveawayReel({ giveaway, className }: { giveaway: Giveaway; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  const done = now >= giveaway.startedAt + giveaway.durationMs;
  useEffect(() => {
    if (done) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done, giveaway.id]);

  const { index, rollProgress } = reelIndex(giveaway, now);
  const L = giveaway.names.length;
  const at = (offset: number) => giveaway.names[(index + offset + L * 2) % L];

  if (done) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-[0.5em] py-[1em] text-center", className)}>
        <p className="flex items-center gap-[0.5em] text-[0.7em] font-bold uppercase tracking-[0.22em] text-[#d8b25a]">
          <PartyPopper className="size-[1.4em]" />
          Winner
          <PartyPopper className="size-[1.4em] -scale-x-100" />
        </p>
        <p className="mb-giveaway-pop break-all text-[1.9em] font-extrabold leading-tight text-foreground drop-shadow-[0_0_18px_rgba(216,178,90,0.45)]">
          {giveaway.winner}
        </p>
        <p className="text-[0.66em] text-muted-foreground">
          drawn from {giveaway.eligible.toLocaleString()} chatters
        </p>
      </div>
    );
  }

  // Rolling: a 3-row window; motion blur eases off as the reel slows, gone during the hold.
  const blur = Math.max(0, (1 - rollProgress) * 3);
  return (
    <div className={cn("relative flex flex-col justify-center overflow-hidden py-[0.4em]", className)} aria-label="Giveaway rolling">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[1.6em] bg-gradient-to-b from-[#161619] to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[1.6em] bg-gradient-to-t from-[#161619] to-transparent" />
      <div className="flex flex-col items-center gap-[0.35em] text-center" style={{ filter: `blur(${blur.toFixed(1)}px)` }}>
        <p className="truncate text-[1em] font-semibold text-muted-foreground/60">{at(-1)}</p>
        <p className="w-full truncate rounded-xl border border-white/[0.1] bg-white/[0.04] px-[0.8em] py-[0.3em] text-[1.45em] font-extrabold text-foreground">
          {at(0)}
        </p>
        <p className="truncate text-[1em] font-semibold text-muted-foreground/60">{at(1)}</p>
      </div>
    </div>
  );
}

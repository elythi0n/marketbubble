"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Gift } from "lucide-react";

import { GiveawayReel } from "@/components/giveaway/giveaway-reel";
import { useControl } from "@/lib/control/client";

/**
 * OBS giveaway overlay: invisible until a roll starts, then the same deterministic reel the
 * admin page shows, then the winner — on screen until the operator clears it.
 *
 * Query params:
 *   bg=transparent      transparent background for OBS (default: graphite, for previewing)
 *   scale=<0.7–2>       size multiplier (default 1)
 */
function GiveawayOverlay() {
  const params = useSearchParams();
  const bg = params.get("bg") ?? "dark";
  const scale = Math.min(2, Math.max(0.7, Number(params.get("scale")) || 1));

  const { giveaway } = useControl();

  useEffect(() => {
    if (bg !== "transparent") return;
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return () => {
      document.documentElement.style.background = "";
      document.body.style.background = "";
    };
  }, [bg]);

  // Re-render the frame chrome when the roll lands (the reel ticks itself).
  const [, setLanded] = useState(0);
  useEffect(() => {
    if (!giveaway) return;
    const remaining = giveaway.startedAt + giveaway.durationMs - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(() => setLanded((n) => n + 1), remaining + 60);
    return () => clearTimeout(id);
  }, [giveaway]);

  return (
    <div
      className="overlay-root flex h-dvh items-end justify-center overflow-hidden p-6"
      style={{ background: bg === "transparent" ? "transparent" : "#141416", fontSize: `${scale}rem` }}
    >
      {giveaway ? (
        <div className="w-full max-w-[26em] rounded-2xl border border-white/12 bg-[#161619]/95 p-[1.1em] shadow-[0_24px_70px_-20px_rgba(0,0,0,0.9)]">
          <p className="flex items-center justify-center gap-[0.5em] text-[0.66em] font-bold uppercase tracking-[0.22em] text-[#85858d]">
            <Gift style={{ width: "1.3em", height: "1.3em" }} />
            Giveaway
          </p>
          <GiveawayReel giveaway={giveaway} className="mt-[0.5em]" />
        </div>
      ) : bg !== "transparent" ? (
        <p className="m-auto text-sm text-[#85858d]">No giveaway running — start one from /admin/giveaway</p>
      ) : null}
    </div>
  );
}

export default function GiveawayOverlayPage() {
  return (
    <Suspense fallback={null}>
      <GiveawayOverlay />
    </Suspense>
  );
}

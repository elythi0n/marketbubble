"use client";

import { useEffect, useState } from "react";

import { type PredictionRow } from "@/lib/markets/predictions";

function PredictionItem({ p }: { p: PredictionRow }) {
  return (
    <span className="flex items-center gap-2.5 px-7">
      <span className="text-[0.9rem] font-medium text-foreground/90">{p.question}</span>
      <span className="font-mono text-[0.9rem] font-semibold tabular-nums text-[#d8b25a]">{p.yesPercent}%</span>
      <span aria-hidden className="ml-3 size-1 rounded-full bg-white/15" />
    </span>
  );
}

const LABEL = "z-20 flex h-full flex-none items-center bg-[#141416] px-4 text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

/** Scrolling Polymarket prediction titles (real data, same source as the Predictions pane). */
export function PredictionsMarquee() {
  const [preds, setPreds] = useState<PredictionRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/markets/predictions")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PredictionRow[]) => {
        if (!cancelled && Array.isArray(d)) setPreds(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (preds.length === 0) return null;
  const durationSeconds = Math.max(60, preds.length * 8);

  return (
    <div className="mb-marquee relative flex h-12 flex-none items-center overflow-hidden bg-white/[0.012]">
      {/* fixed bookends mirroring each other */}
      <span className={`${LABEL} absolute left-0 top-0 border-r border-white/[0.07]`}>Predictions</span>
      <div className="mb-marquee-track" style={{ ["--mb-marquee-duration" as string]: `${durationSeconds}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {preds.map((p) => (
              <PredictionItem key={`${copy}-${p.id}`} p={p} />
            ))}
          </div>
        ))}
      </div>
      <span className={`${LABEL} absolute right-0 top-0 border-l border-white/[0.07] normal-case tracking-[0.04em]`}>via Polymarket</span>
    </div>
  );
}

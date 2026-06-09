"use client";

import { useEffect, useState } from "react";

import { MOCK_PREDICTIONS, type PredictionRow } from "@/lib/markets/predictions";

const POLL_MS = 60_000;

export function PredictionsPane() {
  const [rows, setRows] = useState<PredictionRow[]>(MOCK_PREDICTIONS);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/markets/predictions");
        if (!res.ok) return;
        const data = (await res.json()) as PredictionRow[];
        if (data.length > 0) setRows(data);
      } catch {}
    };
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Predictions
        </span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground/80">via Polymarket</span>
      </header>
      <ul className="flex-1 overflow-y-auto p-2.5 mb-scroll">
        {rows.map((p) => (
          <li
            key={p.id}
            className="mb-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 last:mb-0"
          >
            <p className="text-[0.82rem] font-medium leading-snug text-foreground">{p.question}</p>
            <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <span className="bg-[#46c45a]" style={{ width: `${p.yesPercent}%` }} />
              <span className="bg-[#ef6a61]" style={{ width: `${p.noPercent}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[0.7rem]">
              <span className="font-mono font-semibold tabular-nums text-[#46c45a]">Yes {p.yesPercent}%</span>
              <span className="text-muted-foreground">{p.volume} Vol</span>
              <span className="font-mono font-semibold tabular-nums text-[#ef6a61]">No {p.noPercent}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

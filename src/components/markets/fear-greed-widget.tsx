"use client";

import { useEffect, useState } from "react";

function zoneColor(v: number): string {
  if (v < 25) return "#ef6a61";
  if (v < 45) return "#e0894a";
  if (v < 55) return "#d8b25a";
  if (v < 75) return "#7fbf5a";
  return "#46c45a";
}

export function FearGreedWidget() {
  const [data, setData] = useState<{ value: number; classification: string } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/markets/fear-greed")
      .then((r) => r.json())
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const value = data?.value ?? 0;
  const color = zoneColor(value);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fear &amp; Greed</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5">
        <span className="font-mono text-5xl font-bold tabular-nums" style={{ color }}>
          {data ? value : "—"}
        </span>
        <span className="text-sm font-medium" style={{ color }}>
          {data?.classification ?? "Loading…"}
        </span>
        <div className="mt-1 h-2 w-full max-w-[16rem] overflow-hidden rounded-full bg-[linear-gradient(90deg,#ef6a61,#e0894a,#d8b25a,#7fbf5a,#46c45a)]">
          <div className="relative h-full">
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#0c0c0e] bg-white"
              style={{ left: `${value}%` }}
            />
          </div>
        </div>
        <div className="flex w-full max-w-[16rem] justify-between text-[0.58rem] uppercase tracking-wide text-muted-foreground">
          <span>Extreme fear</span>
          <span>Extreme greed</span>
        </div>
      </div>
    </div>
  );
}

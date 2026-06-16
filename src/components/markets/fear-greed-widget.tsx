"use client";

import { useEffect, useState } from "react";

// Map the fear→greed scale onto the theme's feed semantics so the big number/label stay legible on
// both the dark graphite and the light paper. The intermediate "fear" orange has no dedicated token,
// so it falls back to the warn amber.
function zoneColor(v: number): string {
  if (v < 25) return "var(--feed-danger)";
  if (v < 45) return "var(--feed-warn)";
  if (v < 55) return "var(--feed-warn)";
  if (v < 75) return "var(--feed-ok)";
  return "var(--feed-ok)";
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
      <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fear &amp; Greed</span>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5">
        <span className="font-mono text-5xl font-bold tabular-nums" style={{ color }}>
          {data ? value : "—"}
        </span>
        <span className="text-sm font-medium" style={{ color }}>
          {data?.classification ?? "Loading…"}
        </span>
        <div className="mt-1 h-2 w-full max-w-[16rem] overflow-hidden rounded-full bg-[linear-gradient(90deg,var(--feed-danger),var(--feed-warn),var(--feed-ok))]">
          <div className="relative h-full">
            <span
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
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

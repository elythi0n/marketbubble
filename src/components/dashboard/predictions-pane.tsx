"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";

import { useFlag } from "@/lib/control/client";
import { MOCK_PREDICTIONS, type PredictionRow } from "@/lib/markets/predictions";

const POLL_MS = 60_000;

export function PredictionsPane() {
  const enabled = useFlag("predictions");
  const [rows, setRows] = useState<PredictionRow[]>(MOCK_PREDICTIONS);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/markets/predictions", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as PredictionRow[];
      if (data.length > 0) setRows(data);
    } catch {
      /* silent — keep last known rows */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (!enabled) {
    return (
      <div className="flex h-full items-center justify-center bg-card px-6 text-center text-sm text-muted-foreground">
        Predictions are turned off by the operator.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Predictions
        </span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground/80">via Polymarket</span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          title="Refresh"
          aria-label="Refresh predictions"
          className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground disabled:opacity-60"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </header>
      <ul className="flex-1 overflow-y-auto p-2.5 mb-scroll">
        {rows.map((p) => {
          // A clickable anchor when Polymarket gave us a URL; a plain card otherwise (the mock
          // fallback during cold-boot has no links and shouldn't pretend to).
          const Card = p.url ? "a" : "div";
          return (
            <li key={p.id} className="mb-2 last:mb-0">
              <Card
                {...(p.url ? { href: p.url, target: "_blank", rel: "noopener noreferrer" } : {})}
                className={`group block rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 transition-colors ${
                  p.url ? "cursor-pointer hover:border-white/[0.14] hover:bg-white/[0.04]" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[0.82rem] font-medium leading-snug text-foreground">{p.question}</p>
                  {p.url ? (
                    <ExternalLink
                      className="mt-[2px] size-3 flex-none text-muted-foreground/40 transition-colors group-hover:text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                </div>
                <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <span className="bg-[#46c45a]" style={{ width: `${p.yesPercent}%` }} />
                  <span className="bg-[#ef6a61]" style={{ width: `${p.noPercent}%` }} />
                </div>
                <div className="mt-2 flex items-center justify-between text-[0.7rem]">
                  <span className="font-mono font-semibold tabular-nums text-[#46c45a]">Yes {p.yesPercent}%</span>
                  <span className="text-muted-foreground">{p.volume} Vol</span>
                  <span className="font-mono font-semibold tabular-nums text-[#ef6a61]">No {p.noPercent}%</span>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

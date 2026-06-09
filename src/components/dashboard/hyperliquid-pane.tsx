"use client";

import { useEffect, useState } from "react";

import type { TradeRow } from "@/app/api/hyperliquid/trades/route";

const POLL_MS = 10_000;

export function HyperliquidPane() {
  const [trades, setTrades] = useState<TradeRow[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/hyperliquid/trades");
        if (!res.ok) return;
        const data = (await res.json()) as TradeRow[];
        if (data.length > 0) setTrades(data);
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
          Hyperliquid
        </span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground/80">recent trades</span>
      </header>

      {trades.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <span className="text-[0.72rem] text-muted-foreground/40">Loading…</span>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto mb-scroll">
          {trades.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.03]"
            >
              <span className="w-[5.5rem] shrink-0 truncate font-mono text-[0.68rem] text-muted-foreground/60">
                {t.shortHash}
              </span>
              <span className="w-10 shrink-0 font-mono text-[0.8rem] font-semibold text-foreground">
                {t.asset}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide ${
                  t.side === "long"
                    ? "bg-[#46c45a]/15 text-[#46c45a]"
                    : "bg-[#ef6a61]/15 text-[#ef6a61]"
                }`}
              >
                {t.side}
              </span>
              <span className="ml-auto font-mono text-[0.74rem] tabular-nums text-muted-foreground">
                {t.size}
              </span>
              <span className="w-[5rem] shrink-0 text-right font-mono text-[0.74rem] tabular-nums text-foreground/70">
                {t.price}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

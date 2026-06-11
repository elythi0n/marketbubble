"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleDollarSign } from "lucide-react";

import { useFeedContext } from "@/lib/chat/feed-context";
import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice } from "@/lib/markets/types";
import { cn } from "@/lib/utils";

const WINDOW_MS = 10 * 60_000;
const MAX_ROWS = 12;

/**
 * Which tickers chat is talking about right now: cashtag mentions over a rolling 10-minute
 * window, joined with live quotes where we track the symbol. Rows open the stock drawer.
 */
export function CashtagTrendsPane() {
  const { messages } = useFeedContext();
  const tickers = useTickers();
  const { openStock } = useStockDrawer();

  // The window slides even when chat is silent.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  const quoteBySymbol = useMemo(() => new Map(tickers.map((t) => [t.symbol.toUpperCase(), t])), [tickers]);

  const rows = useMemo(() => {
    void tick;
    const cutoff = Date.now() - WINDOW_MS;
    const counts = new Map<string, number>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.tsMs < cutoff) break;
      for (const seg of m.segments) {
        if (seg.type === "cashtag") {
          const sym = seg.symbol.toUpperCase();
          counts.set(sym, (counts.get(sym) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_ROWS);
  }, [messages, tick]);

  const max = rows.length > 0 ? rows[0][1] : 1;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <CircleDollarSign className="size-4 text-muted-foreground" />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">Tickers in chat</span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground">last 10 min</span>
      </header>

      {rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <CircleDollarSign className="size-7 text-muted-foreground/40" />
          <span className="text-sm font-medium text-muted-foreground">No cashtags yet</span>
          <span className="text-xs text-muted-foreground/60">
            When chat mentions <span className="font-mono text-foreground/70">$TSLA</span> it shows up here
          </span>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto px-2 py-2 mb-scroll">
          {rows.map(([symbol, count]) => {
            const quote = quoteBySymbol.get(symbol);
            const up = quote ? quote.changePct >= 0 : null;
            return (
              <li key={symbol}>
                <button
                  type="button"
                  onClick={() => openStock(symbol)}
                  className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
                >
                  {/* Relative-share bar behind the row */}
                  <span
                    className="absolute inset-y-1 left-0 rounded-r bg-white/[0.04]"
                    style={{ width: `${(count / max) * 100}%` }}
                    aria-hidden
                  />
                  <span className="relative font-mono text-[0.84rem] font-semibold text-foreground">${symbol}</span>
                  <span className="relative rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.62rem] tabular-nums text-muted-foreground">
                    {count}×
                  </span>
                  <span className="relative ml-auto flex flex-col items-end leading-tight">
                    {quote ? (
                      <>
                        <span className="font-mono text-[0.74rem] tabular-nums text-foreground/90">{formatPrice(quote.price)}</span>
                        <span className={cn("font-mono text-[0.66rem] font-medium tabular-nums", up ? "text-[#46c45a]" : "text-[#ef6a61]")}>
                          {formatChange(quote.changePct)}
                        </span>
                      </>
                    ) : (
                      <span className="text-[0.64rem] text-muted-foreground/50">no quote</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

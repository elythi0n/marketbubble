"use client";

import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice } from "@/lib/markets/types";

function PaneHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
      {hint ? <span className="ml-auto text-[0.62rem] text-muted-foreground/80">{hint}</span> : null}
    </header>
  );
}

export function MarketsPane() {
  const tickers = useTickers();
  const { openStock } = useStockDrawer();
  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <PaneHeader title="Markets" hint="watchlist" />
      <ul className="flex-1 overflow-y-auto mb-scroll">
        {tickers.map((t) => {
          const up = t.changePct >= 0;
          return (
            <li key={t.symbol}>
              <button
                type="button"
                onClick={() => openStock(t.symbol)}
                className="flex w-full items-center gap-3 border-b border-hairline px-3 py-2 text-left transition-colors hover:bg-overlay-weak"
              >
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="font-mono text-[0.84rem] font-semibold text-foreground">{t.symbol}</span>
                  <span className="truncate text-[0.66rem] text-muted-foreground">{t.name}</span>
                </div>
                <div className="flex flex-col items-end leading-tight">
                  <span className="font-mono text-[0.82rem] tabular-nums text-foreground">{formatPrice(t.price)}</span>
                  <span className={`font-mono text-[0.68rem] font-medium tabular-nums ${up ? "text-feed-ok" : "text-feed-danger"}`}>
                    {formatChange(t.changePct)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

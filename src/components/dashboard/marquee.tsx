"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice, type Ticker } from "@/lib/markets/types";
import { cn } from "@/lib/utils";

function TickerItem({ ticker, large }: { ticker: Ticker; large?: boolean }) {
  const up = ticker.changePct >= 0;
  const size = large ? "text-[0.9rem]" : "text-[0.72rem]";
  return (
    <span className={cn("flex items-center gap-2", large ? "px-7" : "px-5")}>
      <span className={cn("font-mono font-semibold tracking-wide text-foreground/90", size)}>{ticker.symbol}</span>
      <span className={cn("font-mono tabular-nums text-muted-foreground", size)}>{formatPrice(ticker.price)}</span>
      <span className={cn("inline-flex items-center gap-0.5 font-mono font-medium tabular-nums", size, up ? "text-feed-ok" : "text-feed-danger")}>
        {up ? <TrendingUp className={large ? "size-4" : "size-3"} /> : <TrendingDown className={large ? "size-4" : "size-3"} />}
        {formatChange(ticker.changePct)}
      </span>
      <span aria-hidden className="ml-3 size-1 rounded-full bg-overlay-strong" />
    </span>
  );
}

/** Continuous right-to-left markets ticker. Two identical runs make the loop seamless. */
export function Marquee({ tickers: tickersProp, large }: { tickers?: Ticker[]; large?: boolean }) {
  const liveTickers = useTickers();
  const tickers = tickersProp ?? liveTickers;
  const durationSeconds = Math.max(48, tickers.length * 4.8);

  return (
    <div className={cn("mb-marquee relative z-20 flex flex-none items-center overflow-hidden border-b border-hairline bg-overlay-weak", large ? "h-12" : "h-9")}>
      <div className="mb-marquee-track" style={{ ["--mb-marquee-duration" as string]: `${durationSeconds}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {tickers.map((ticker) => (
              <TickerItem key={`${copy}-${ticker.symbol}`} ticker={ticker} large={large} />
            ))}
          </div>
        ))}
      </div>

      {/* Edge fades so items dissolve rather than clip at the rails. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}

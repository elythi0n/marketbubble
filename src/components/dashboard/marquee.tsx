"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice, type Ticker } from "@/lib/markets/types";

function TickerItem({ ticker }: { ticker: Ticker }) {
  const up = ticker.changePct >= 0;
  return (
    <span className="flex items-center gap-2 px-5">
      <span className="font-mono text-[0.72rem] font-semibold tracking-wide text-foreground/90">{ticker.symbol}</span>
      <span className="font-mono text-[0.72rem] tabular-nums text-muted-foreground">{formatPrice(ticker.price)}</span>
      <span
        className={`inline-flex items-center gap-0.5 font-mono text-[0.72rem] font-medium tabular-nums ${
          up ? "text-[#3fb950]" : "text-[#f0685f]"
        }`}
      >
        {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
        {formatChange(ticker.changePct)}
      </span>
      <span aria-hidden className="ml-3 size-1 rounded-full bg-white/15" />
    </span>
  );
}

/** Continuous right-to-left markets ticker. Two identical runs make the loop seamless. */
export function Marquee({ tickers: tickersProp }: { tickers?: Ticker[] }) {
  const liveTickers = useTickers();
  const tickers = tickersProp ?? liveTickers;
  const durationSeconds = Math.max(48, tickers.length * 4.8);

  return (
    <div className="mb-marquee relative z-20 flex h-9 flex-none items-center overflow-hidden border-b border-white/[0.07] bg-white/[0.012]">
      <div className="mb-marquee-track" style={{ ["--mb-marquee-duration" as string]: `${durationSeconds}s` }}>
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center" aria-hidden={copy === 1}>
            {tickers.map((ticker) => (
              <TickerItem key={`${copy}-${ticker.symbol}`} ticker={ticker} />
            ))}
          </div>
        ))}
      </div>

      {/* Edge fades so items dissolve rather than clip at the rails. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#141416] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#141416] to-transparent" />
    </div>
  );
}

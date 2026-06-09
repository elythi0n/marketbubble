"use client";

import { useEffect, useState } from "react";

import { formatPrice } from "@/lib/markets/types";
import { useBinanceTickers, type LiveTicker } from "@/lib/markets/use-binance";

const WATCH = [
  { symbol: "BTCUSDT", label: "BTC", name: "Bitcoin" },
  { symbol: "ETHUSDT", label: "ETH", name: "Ethereum" },
  { symbol: "SOLUSDT", label: "SOL", name: "Solana" },
  { symbol: "BNBUSDT", label: "BNB", name: "BNB" },
  { symbol: "XRPUSDT", label: "XRP", name: "XRP" },
  { symbol: "DOGEUSDT", label: "DOGE", name: "Dogecoin" },
  { symbol: "AVAXUSDT", label: "AVAX", name: "Avalanche" },
  { symbol: "LINKUSDT", label: "LINK", name: "Chainlink" },
];

function WatchRow({ label, name, ticker }: { label: string; name: string; ticker?: LiveTicker }) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!ticker?.dir) return;
    setFlash(ticker.dir);
    const t = setTimeout(() => setFlash(null), 380);
    return () => clearTimeout(t);
  }, [ticker?.price, ticker?.dir]);

  const up = (ticker?.changePct ?? 0) >= 0;

  return (
    <li className="flex items-center gap-3 border-b border-white/[0.04] px-3 py-2 transition-colors hover:bg-white/[0.03]">
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-mono text-[0.84rem] font-semibold text-foreground">{label}</span>
        <span className="truncate text-[0.66rem] text-muted-foreground">{name}</span>
      </div>
      <span
        className="rounded px-1.5 py-0.5 font-mono text-[0.84rem] tabular-nums text-foreground transition-colors duration-300"
        style={{
          backgroundColor:
            flash === "up" ? "rgba(70,196,90,0.22)" : flash === "down" ? "rgba(239,106,97,0.22)" : "transparent",
        }}
      >
        {ticker ? `$${formatPrice(ticker.price)}` : "—"}
      </span>
      <span
        className={`w-16 text-right font-mono text-[0.74rem] font-medium tabular-nums ${
          ticker ? (up ? "text-[#46c45a]" : "text-[#ef6a61]") : "text-muted-foreground"
        }`}
      >
        {ticker ? `${up ? "+" : ""}${ticker.changePct.toFixed(2)}%` : "—"}
      </span>
    </li>
  );
}

export function LiveWatchlist() {
  const tickers = useBinanceTickers(WATCH.map((w) => w.symbol));
  const anyLive = Object.keys(tickers).length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Watchlist</span>
        <span className="ml-auto flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
          <span className={`size-1.5 rounded-full ${anyLive ? "bg-[#46c45a]" : "bg-muted-foreground"}`} />
          {anyLive ? "live" : "connecting"}
        </span>
      </header>
      <ul className="flex-1 overflow-y-auto mb-scroll">
        {WATCH.map((w) => (
          <WatchRow key={w.symbol} label={w.label} name={w.name} ticker={tickers[w.symbol]} />
        ))}
      </ul>
    </div>
  );
}

"use client";

import { X, ExternalLink } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useTheme } from "@/lib/theme/theme-context";
import { formatChange, formatPrice } from "@/lib/markets/types";
import type { Ticker } from "@/lib/markets/types";

// Map our symbols to TradingView exchange:symbol format
const TV_SYMBOLS: Record<string, string> = {
  BTC: "BINANCE:BTCUSDT",
  ETH: "BINANCE:ETHUSDT",
  SOL: "BINANCE:SOLUSDT",
  HYPE: "BINANCE:HYPEUSDT",
  DOGE: "BINANCE:DOGEUSDT",
  NVDA: "NASDAQ:NVDA",
  TSLA: "NASDAQ:TSLA",
  AAPL: "NASDAQ:AAPL",
  SPX: "SP:SPX",
  NDX: "NASDAQ:NDX",
};

function tvSymbol(symbol: string): string {
  return TV_SYMBOLS[symbol.toUpperCase()] ?? symbol;
}

function tvUrl(symbol: string, frameId: string, theme: "light" | "dark"): string {
  // Match the embed chrome to the app surface: dark sidebar graphite vs. light popover paper.
  const bg = theme === "dark" ? "161619" : "fbf9f2";
  const params = new URLSearchParams({
    frameElementId: frameId,
    symbol: tvSymbol(symbol),
    interval: "D",
    theme,
    style: "1",
    locale: "en",
    hide_top_toolbar: "0",
    hidesidetoolbar: "0",
    saveimage: "0",
    enable_publishing: "false",
    toolbarbg: bg,
    bg_color: bg,
    calendar: "false",
  });
  return `https://www.tradingview.com/widgetembed/?${params}`;
}

function DrawerLoader() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <MarketBubbleLogo className="size-14 text-foreground/70" />
      <div className="h-[3px] w-28 overflow-hidden rounded-full bg-overlay-medium">
        <motion.div
          className="h-full w-1/3 rounded-full bg-foreground/40"
          animate={{ x: ["-110%", "330%"] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

function TickerHeader({ ticker }: { ticker: Ticker }) {
  const up = ticker.changePct >= 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[1.1rem] font-bold text-foreground">{ticker.symbol}</span>
        <span className="text-[0.72rem] text-muted-foreground">{ticker.name}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="font-mono text-[0.9rem] font-semibold tabular-nums text-foreground">{formatPrice(ticker.price)}</span>
        <span className={`font-mono text-[0.75rem] font-medium tabular-nums ${up ? "text-feed-ok" : "text-feed-danger"}`}>
          {formatChange(ticker.changePct)}
        </span>
      </div>
    </div>
  );
}

export function StockDrawer() {
  const { symbol, closeStock } = useStockDrawer();
  const { resolvedTheme } = useTheme();
  const frameId = useId().replace(/:/g, "");

  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [chartLoaded, setChartLoaded] = useState(false);

  // Fetch ticker data when symbol changes
  useEffect(() => {
    if (!symbol) return;
    setTicker(null);
    setChartLoaded(false);
    fetch("/api/markets/quotes")
      .then((r) => r.json())
      .then((data: Ticker[]) => {
        const found = data.find((t) => t.symbol === symbol);
        if (found) setTicker(found);
      })
      .catch(() => null);
  }, [symbol]);

  // The iframe is keyed on theme, so switching themes remounts it; show the loader again until
  // the freshly-themed chart paints.
  useEffect(() => {
    setChartLoaded(false);
  }, [resolvedTheme]);

  const tvLink = symbol ? `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol(symbol))}` : "#";

  return (
    <Drawer direction="right" open={!!symbol} onOpenChange={(open) => { if (!open) closeStock(); }}>
      <DrawerContent>
        <DrawerTitle>{symbol ? `${symbol} chart` : "Stock chart"}</DrawerTitle>
        <DrawerHeader>
          {ticker ? <TickerHeader ticker={ticker} /> : (
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-mono text-[1.1rem] font-bold text-foreground">{symbol}</span>
            </div>
          )}
          <DrawerClose asChild>
            <button
              type="button"
              aria-label="Close"
              className="ml-auto flex size-8 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </DrawerClose>
        </DrawerHeader>

        {/* Chart area */}
        <div className="relative min-h-0 flex-1">
          <AnimatePresence>
            {!chartLoaded && (
              <motion.div
                className="absolute inset-0 z-10 flex flex-col"
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <DrawerLoader />
              </motion.div>
            )}
          </AnimatePresence>

          {symbol && (
            <iframe
              key={`${symbol}-${resolvedTheme}`}
              id={frameId}
              src={tvUrl(symbol, frameId, resolvedTheme === "dark" ? "dark" : "light")}
              className="absolute inset-0 h-full w-full border-0"
              title={`${symbol} chart`}
              onLoad={() => setChartLoaded(true)}
            />
          )}
        </div>

        <DrawerFooter>
          <a
            href={tvLink}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 text-[0.72rem] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ExternalLink className="size-3" />
            Open on TradingView
          </a>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

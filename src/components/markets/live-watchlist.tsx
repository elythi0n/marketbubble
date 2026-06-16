"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";

import { setChartSymbol } from "@/lib/markets/chart-symbol";
import { formatPrice } from "@/lib/markets/types";
import { useBinanceTickers, type LiveTicker } from "@/lib/markets/use-binance";
import { useYahooQuotes } from "@/lib/markets/use-yahoo";

/**
 * Per-visitor watchlist. Mixes two data sources:
 *  - Binance WebSocket for symbols that end in a known crypto quote suffix (USDT/USDC/…) —
 *    these tick live.
 *  - /api/markets/quote/{symbol} (Yahoo Finance) for everything else (stocks, indexes, and
 *    short crypto bases like BTC/ETH which the endpoint retries as BTC-USD on 404) — these
 *    poll every 15s.
 *
 * Persisted in localStorage. Clicking a row pushes the symbol over to the chart panel via
 * the chart-symbol store; dragging the grip handle reorders.
 */

const STORAGE_KEY = "mb-watchlist-v1";

const DEFAULT_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT"];

const QUOTE_CURRENCIES = ["USDT", "USDC", "BUSD", "FDUSD"];

function isBinancePair(symbol: string): boolean {
  return QUOTE_CURRENCIES.some((q) => symbol.endsWith(q) && symbol.length > q.length);
}

/** Normalize user input. Keep alphanumerics plus `.`, `-`, `^` (e.g. ^GSPC, BRK.B, BTC-USD).
 *  No auto-USDT — stocks like NVDA stay as NVDA. */
function normalizeSymbol(input: string): string | null {
  const cleaned = input.trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, "");
  if (cleaned.length < 1 || cleaned.length > 16) return null;
  return cleaned;
}

/** TradingView symbol format. Crypto Binance pairs get the BINANCE: prefix; everything else
 *  is passed bare and TradingView resolves to its default exchange. */
function chartSymbolFor(symbol: string): string {
  return isBinancePair(symbol) ? `BINANCE:${symbol}` : symbol;
}

/** Display label: strip the quote currency suffix on crypto pairs so the eye sees BTC, not BTCUSDT. */
function displayLabel(symbol: string): string {
  for (const q of QUOTE_CURRENCIES) {
    if (symbol.endsWith(q) && symbol.length > q.length) return symbol.slice(0, -q.length);
  }
  return symbol;
}

function loadSymbols(): string[] {
  if (typeof window === "undefined") return DEFAULT_SYMBOLS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string" && /^[A-Z0-9.\-^]{1,16}$/.test(s))) {
        return parsed as string[];
      }
    }
  } catch {
    /* corrupt — fall through to default */
  }
  return DEFAULT_SYMBOLS;
}

interface WatchRowProps {
  symbol: string;
  ticker: LiveTicker | undefined;
  index: number;
  dragHoverIndex: number | null;
  onRemove: () => void;
  onSelect: () => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  onDrop: () => void;
}

function WatchRow({
  symbol,
  ticker,
  index,
  dragHoverIndex,
  onRemove,
  onSelect,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
}: WatchRowProps) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (!ticker?.dir) return;
    setFlash(ticker.dir);
    const t = setTimeout(() => setFlash(null), 380);
    return () => clearTimeout(t);
  }, [ticker?.price, ticker?.dir]);

  const up = (ticker?.changePct ?? 0) >= 0;
  const isHover = dragHoverIndex === index;

  return (
    <li
      draggable
      onClick={onSelect}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Firefox needs some payload or `drop` never fires.
        e.dataTransfer.setData("text/plain", symbol);
        onDragStart(index);
      }}
      onDragEnter={() => onDragEnter(index)}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      title={`View ${displayLabel(symbol)} on the chart`}
      className={`group flex cursor-pointer items-center gap-2 border-b border-hairline px-2 py-2 transition-colors hover:bg-overlay-weak ${
        isHover ? "bg-overlay-medium" : ""
      }`}
    >
      <span
        className="flex-none cursor-grab text-muted-foreground/60 transition-colors hover:text-muted-foreground active:cursor-grabbing"
        title="Drag to reorder"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="font-mono text-[0.84rem] font-semibold text-foreground">{displayLabel(symbol)}</span>
        <span className="truncate text-[0.62rem] text-muted-foreground/80">{symbol}</span>
      </div>
      <span
        className="rounded px-1.5 py-0.5 font-mono text-[0.84rem] tabular-nums text-foreground transition-colors duration-300"
        style={{
          backgroundColor:
            flash === "up"
              ? "color-mix(in srgb, var(--feed-ok) 22%, transparent)"
              : flash === "down"
                ? "color-mix(in srgb, var(--feed-danger) 22%, transparent)"
                : "transparent",
        }}
      >
        {ticker ? `$${formatPrice(ticker.price)}` : "—"}
      </span>
      <span
        className={`w-14 text-right font-mono text-[0.72rem] font-medium tabular-nums ${
          ticker ? (up ? "text-feed-ok" : "text-feed-danger") : "text-muted-foreground"
        }`}
      >
        {ticker ? `${up ? "+" : ""}${ticker.changePct.toFixed(2)}%` : "—"}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove"
        aria-label={`Remove ${displayLabel(symbol)}`}
        className="flex-none rounded text-muted-foreground/40 opacity-0 transition-all hover:text-feed-danger group-hover:opacity-100"
      >
        <X className="size-3.5" />
      </button>
    </li>
  );
}

export function LiveWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(DEFAULT_SYMBOLS);
  const [hydrated, setHydrated] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addValue, setAddValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSymbols(loadSymbols());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
    } catch {
      /* quota / private mode */
    }
  }, [hydrated, symbols]);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  // Partition into the two data sources so each hook only subscribes to symbols it can serve.
  const { cryptoSymbols, stockSymbols } = useMemo(() => {
    const crypto: string[] = [];
    const stock: string[] = [];
    for (const s of symbols) (isBinancePair(s) ? crypto : stock).push(s);
    return { cryptoSymbols: crypto, stockSymbols: stock };
  }, [symbols]);

  const cryptoTickers = useBinanceTickers(cryptoSymbols);
  const stockTickers = useYahooQuotes(stockSymbols);

  const tickerFor = useCallback(
    (s: string): LiveTicker | undefined => (isBinancePair(s) ? cryptoTickers[s] : stockTickers[s]),
    [cryptoTickers, stockTickers],
  );

  const anyLive = useMemo(
    () => Object.keys(cryptoTickers).length + Object.keys(stockTickers).length > 0,
    [cryptoTickers, stockTickers],
  );

  const submitAdd = useCallback(() => {
    const normalized = normalizeSymbol(addValue);
    if (!normalized) {
      setAddError("Enter a symbol like NVDA, BTC, or BTCUSDT.");
      return;
    }
    if (symbols.includes(normalized)) {
      setAddError(`${displayLabel(normalized)} is already on your list.`);
      return;
    }
    setSymbols((prev) => [...prev, normalized]);
    setAddValue("");
    setAddError(null);
  }, [addValue, symbols]);

  const remove = useCallback((symbol: string) => {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
  }, []);

  const select = useCallback((symbol: string) => {
    setChartSymbol(chartSymbolFor(symbol));
  }, []);

  const onDragStart = useCallback((index: number) => {
    dragIndexRef.current = index;
  }, []);

  const onDragEnter = useCallback((index: number) => {
    setHoverIndex(index);
  }, []);

  const onDrop = useCallback(() => {
    const from = dragIndexRef.current;
    const to = hoverIndex;
    if (from === null || to === null || from === to) {
      dragIndexRef.current = null;
      setHoverIndex(null);
      return;
    }
    setSymbols((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    dragIndexRef.current = null;
    setHoverIndex(null);
  }, [hoverIndex]);

  const onDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setHoverIndex(null);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Watchlist</span>
        <span className="ml-auto flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
          <span className={`size-1.5 rounded-full ${anyLive ? "bg-feed-ok" : "bg-muted-foreground"}`} />
          {anyLive ? "live" : "connecting"}
        </span>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setAddError(null);
          }}
          title={adding ? "Close" : "Add symbol"}
          aria-label={adding ? "Close add input" : "Add symbol"}
          aria-expanded={adding}
          className="flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
        >
          <Plus className={`size-3.5 transition-transform ${adding ? "rotate-45" : ""}`} />
        </button>
      </header>

      {adding ? (
        <div className="flex-none border-b border-hairline bg-overlay-weak p-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitAdd();
            }}
            className="flex items-center gap-2"
          >
            <input
              ref={addInputRef}
              value={addValue}
              onChange={(e) => {
                setAddValue(e.target.value);
                setAddError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setAddError(null);
                }
              }}
              placeholder="e.g. NVDA, BTC, BTCUSDT"
              className="min-w-0 flex-1 rounded border border-hairline bg-overlay-weak px-2 py-1 font-mono text-[0.78rem] uppercase text-foreground outline-none placeholder:text-muted-foreground/50 placeholder:normal-case focus:border-hairline-strong"
              maxLength={16}
              spellCheck={false}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button
              type="submit"
              className="rounded bg-overlay-medium px-2 py-1 text-[0.74rem] font-medium text-foreground transition-colors hover:bg-overlay-strong"
            >
              Add
            </button>
          </form>
          {addError ? <p className="mt-1.5 text-[0.66rem] text-feed-danger">{addError}</p> : null}
        </div>
      ) : null}

      {symbols.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
          <p className="text-[0.78rem] text-muted-foreground">Your watchlist is empty.</p>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="rounded border border-hairline bg-overlay-weak px-3 py-1.5 text-[0.74rem] text-foreground transition-colors hover:bg-overlay-medium"
          >
            Add a symbol
          </button>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto mb-scroll">
          {symbols.map((symbol, i) => (
            <WatchRow
              key={symbol}
              symbol={symbol}
              ticker={tickerFor(symbol)}
              index={i}
              dragHoverIndex={hoverIndex}
              onRemove={() => remove(symbol)}
              onSelect={() => select(symbol)}
              onDragStart={onDragStart}
              onDragEnter={onDragEnter}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

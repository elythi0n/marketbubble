"use client";

import { useEffect, useRef, useState } from "react";

import type { LiveTicker } from "./use-binance";

/**
 * Polls /api/markets/quote/{symbol} for the given list of symbols every POLL_MS. Returns the
 * same { price, changePct, dir } shape as the Binance live-tick hook so the watchlist can
 * treat the two data sources interchangeably.
 *
 * Direction (`dir`) flips to "up" / "down" only when the price strictly changes between
 * polls — the row-flash animation in the watchlist keys off it.
 */

const POLL_MS = 15_000;

export function useYahooQuotes(symbols: string[]): Record<string, LiveTicker> {
  const [data, setData] = useState<Record<string, LiveTicker>>({});
  const prevPrice = useRef<Record<string, number>>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (symbols.length === 0) {
      setData({});
      return;
    }
    let cancelled = false;

    const poll = async () => {
      const results = await Promise.allSettled(
        symbols.map(async (s) => {
          const res = await fetch(`/api/markets/quote/${encodeURIComponent(s)}`, { cache: "no-store" });
          if (!res.ok) return null;
          return (await res.json()) as { price: number; changePct: number };
        }),
      );
      if (cancelled) return;

      setData((prev) => {
        const next: Record<string, LiveTicker> = { ...prev };
        for (let i = 0; i < symbols.length; i++) {
          const s = symbols[i];
          const r = results[i];
          if (r.status === "fulfilled" && r.value && Number.isFinite(r.value.price)) {
            const before = prevPrice.current[s];
            const dir: "up" | "down" | null =
              before == null || before === r.value.price ? null : r.value.price > before ? "up" : "down";
            next[s] = { price: r.value.price, changePct: r.value.changePct, dir };
            prevPrice.current[s] = r.value.price;
          }
        }
        // Drop entries for symbols that left the watchlist.
        for (const k of Object.keys(next)) {
          if (!symbols.includes(k)) delete next[k];
        }
        return next;
      });
    };

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

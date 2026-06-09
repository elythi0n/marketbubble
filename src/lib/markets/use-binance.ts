"use client";

import { useEffect, useRef, useState } from "react";

export interface LiveTicker {
  price: number;
  changePct: number;
  /** Direction of the latest tick vs the previous, for flash styling. */
  dir: "up" | "down" | null;
}

/**
 * Subscribe to Binance combined miniTicker streams for the given symbols (e.g. "BTCUSDT") and return
 * a live map of price + 24h change. Updates tick-by-tick over a single WebSocket — no polling.
 */
export function useBinanceTickers(symbols: string[]): Record<string, LiveTicker> {
  const [data, setData] = useState<Record<string, LiveTicker>>({});
  const prev = useRef<Record<string, number>>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (symbols.length === 0) return;
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        const d = msg?.data;
        if (!d?.s) return;
        const sym = d.s as string;
        const price = parseFloat(d.c);
        const open = parseFloat(d.o);
        const changePct = open ? ((price - open) / open) * 100 : 0;
        const last = prev.current[sym];
        const dir = last == null || price === last ? null : price > last ? "up" : "down";
        prev.current[sym] = price;
        setData((cur) => ({ ...cur, [sym]: { price, changePct, dir } }));
      } catch {
        /* ignore malformed frames */
      }
    };

    return () => ws.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return data;
}

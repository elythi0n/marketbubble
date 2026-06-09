"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { MOCK_TICKERS } from "./mock";
import type { Ticker } from "./types";

const POLL_MS = 60_000;

const TickersContext = createContext<Ticker[]>(MOCK_TICKERS);

export function TickersProvider({ children }: { children: ReactNode }) {
  const [tickers, setTickers] = useState<Ticker[]>(MOCK_TICKERS);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch("/api/markets/quotes");
        if (!res.ok) return;
        const data = (await res.json()) as Ticker[];
        if (Array.isArray(data) && data.length > 0) setTickers(data);
      } catch {
        // keep last known tickers
      }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return <TickersContext.Provider value={tickers}>{children}</TickersContext.Provider>;
}

export function useTickers(): Ticker[] {
  return useContext(TickersContext);
}

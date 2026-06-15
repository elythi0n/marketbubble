"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny global store for the markets-board chart symbol. Lets the watchlist push a click
 * over to the chart panel without React context plumbing — useSyncExternalStore subscribes
 * the chart wrapper to changes, and setChartSymbol fans out to every subscriber.
 *
 * Persisted in localStorage so a reload restores the last-selected symbol the same way
 * dock layout does.
 */

const STORAGE_KEY = "mb-chart-symbol-v1";
const DEFAULT = "BINANCE:BTCUSDT";

let current = DEFAULT;
const listeners = new Set<() => void>();
let hydrated = false;

function hydrateOnce() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && /^[A-Z0-9.\-^:]{1,32}$/.test(raw)) current = raw;
  } catch {
    /* private mode / quota — fall through to default */
  }
}

export function setChartSymbol(s: string) {
  hydrateOnce();
  if (s === current) return;
  current = s;
  try {
    localStorage.setItem(STORAGE_KEY, s);
  } catch {
    /* quota / private mode */
  }
  for (const fn of listeners) fn();
}

export function useChartSymbol(): string {
  return useSyncExternalStore(
    (cb) => {
      hydrateOnce();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => DEFAULT,
  );
}

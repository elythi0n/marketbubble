"use client";

import type { Platform } from "@/lib/feed/types";

export interface HighlightExcerpt {
  author: string;
  text: string;
  platform: Platform;
  color?: string;
}

export interface Highlight {
  id: string;
  tsMs: number;
  ratio: number;
  mpm: number;
  excerpts: HighlightExcerpt[];
  anchorMsgId?: string;
}

const store: Highlight[] = [];
const listeners = new Set<() => void>();

export function getHighlights(): readonly Highlight[] {
  return store;
}

export function addHighlight(h: Highlight): void {
  store.unshift(h);
  if (store.length > 100) store.pop();
  for (const l of listeners) l();
}

export function clearHighlights(): void {
  store.length = 0;
  for (const l of listeners) l();
}

export function subscribeHighlights(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable version token for useSyncExternalStore. */
export function highlightsVersion(): number {
  return store.length;
}

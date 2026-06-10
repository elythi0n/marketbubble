"use client";

import { useSyncExternalStore } from "react";

import { markDockActivity } from "@/lib/dock-activity";
import type { FeedMessage } from "@/lib/feed/types";

/**
 * Session-only mention inbox: every message across the merged feed that contains one of the
 * configured names (Settings → Chat). Collected by a bridge in the dashboard shell so mentions
 * accumulate even while the panel is closed. In-memory, capped, wiped on reload.
 */
const MAX = 500;

let names: string[] = [];
let buf: FeedMessage[] = [];
let snapshot: readonly FeedMessage[] = [];
let seen = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  snapshot = [...buf];
  for (const l of listeners) l();
}

export function setMentionNames(raw: string) {
  names = raw
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function mentionNamesConfigured(): boolean {
  return names.length > 0;
}

function bodyText(m: FeedMessage): string {
  return m.segments
    .map((seg) =>
      seg.type === "text" ? seg.text
      : seg.type === "emote" ? seg.code
      : seg.type === "mention" ? `@${seg.user}`
      : seg.type === "cashtag" ? `$${seg.symbol}`
      : seg.type === "link" ? seg.text
      : "",
    )
    .join("");
}

export function collectMentions(messages: readonly FeedMessage[]) {
  if (names.length === 0) return;
  let added = false;
  for (const m of messages) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const text = bodyText(m).toLowerCase();
    if (!names.some((n) => text.includes(n))) continue;
    buf.push(m);
    added = true;
  }
  if (!added) return;
  if (buf.length > MAX) buf = buf.slice(buf.length - MAX);
  // Bound the processed-id set; old ids never reappear (the feed buffer is far smaller).
  if (seen.size > 20_000) seen = new Set(buf.map((m) => m.id));
  markDockActivity("inbox");
  emit();
}

export function clearMentions() {
  buf = [];
  emit();
}

export function useMentions(): readonly FeedMessage[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snapshot,
    () => snapshot,
  );
}

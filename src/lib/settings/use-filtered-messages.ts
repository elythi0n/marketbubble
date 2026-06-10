"use client";

import { useMemo } from "react";

import { useControl } from "@/lib/control/client";
import type { FeedMessage } from "@/lib/feed/types";
import { useSettingsOrDefault, type FilterRule } from "./settings-context";

/** All searchable text of a message body (text runs, emote codes, mentions, cashtags, links). */
function bodyText(m: FeedMessage): string {
  let out = "";
  for (const seg of m.segments) {
    out +=
      seg.type === "text" ? seg.text
      : seg.type === "emote" ? ` ${seg.code} `
      : seg.type === "mention" ? ` @${seg.user} `
      : seg.type === "cashtag" ? ` $${seg.symbol} `
      : seg.type === "link" ? ` ${seg.text} `
      : "";
  }
  return out.toLowerCase();
}

/**
 * Applies the user's filter rules: muted messages are dropped, highlight matches get the same
 * treatment as Twitch's highlighted messages. Display-only — the underlying buffer, stats and
 * gift events keep every message.
 */
export function applyFilters(messages: readonly FeedMessage[], filters: readonly FilterRule[]): readonly FeedMessage[] {
  const active = filters
    .map((f) => ({ ...f, pattern: f.pattern.trim().toLowerCase() }))
    .filter((f) => f.pattern.length > 0);
  if (active.length === 0) return messages;

  const mutes = active.filter((f) => f.action === "mute");
  const highlights = active.filter((f) => f.action === "highlight");

  const out: FeedMessage[] = [];
  for (const m of messages) {
    const author = m.author.toLowerCase();
    // Body text is built lazily — author-only rule sets never pay for it.
    let body: string | null = null;
    const matches = (r: (typeof active)[number]) =>
      r.field === "author" ? author.includes(r.pattern) : (body ??= bodyText(m)).includes(r.pattern);

    if (mutes.some(matches)) continue;
    out.push(!m.highlighted && highlights.some(matches) ? { ...m, highlighted: true } : m);
  }
  return out;
}

/**
 * Messages with filter rules applied: operator filters pushed from /admin over the control
 * stream run first (everyone gets them), then the viewer's own rules from settings.
 */
export function useFilteredMessages(messages: readonly FeedMessage[]): readonly FeedMessage[] {
  const { filters } = useSettingsOrDefault();
  const { filters: globalFilters } = useControl();
  return useMemo(
    () => applyFilters(messages, globalFilters.length > 0 ? [...globalFilters, ...filters] : filters),
    [messages, filters, globalFilters],
  );
}

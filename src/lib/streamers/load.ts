import { readFileSync } from "fs";
import { join } from "path";

import { MOCK_STREAMERS, type Streamer } from "./mock";

/**
 * Server-only: load the configured roster, in priority order.
 *   1. STREAMERS_JSON env var (for hosts where you can't edit files)
 *   2. streamers.json at the project root
 *   3. the hardcoded MOCK_STREAMERS fallback
 */
export function loadRoster(): Streamer[] {
  const env = process.env.STREAMERS_JSON;
  if (env) {
    try {
      return JSON.parse(env) as Streamer[];
    } catch {
      console.error("[streamers] STREAMERS_JSON is not valid JSON, ignoring");
    }
  }

  try {
    const raw = readFileSync(join(process.cwd(), "streamers.json"), "utf-8");
    return JSON.parse(raw) as Streamer[];
  } catch {
    /* file missing or malformed */
  }

  return MOCK_STREAMERS;
}

/**
 * Every X broadcast source across the roster (each streamer's `xBroadcasts`), de-duplicated by
 * normalized handle / broadcast id so a shared show account (e.g. MarketBubble) listed on several
 * streamers is only watched once.
 */
export function rosterXBroadcastSources(roster: Streamer[] = loadRoster()): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of roster) {
    for (const src of s.xBroadcasts ?? []) {
      const key = normalizeXSource(src);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(src.trim());
    }
  }
  return out;
}

/** Normalize an X source to a dedup key: broadcast id from a link, else lowercased handle. */
export function normalizeXSource(src: string): string {
  const s = src.trim();
  const link = /broadcasts\/([A-Za-z0-9]+)/i.exec(s);
  if (link) return link[1];
  return s.replace(/^@/, "").toLowerCase();
}

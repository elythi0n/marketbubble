/**
 * Analytics sampler — runs only when the database is enabled (see db.ts). Two jobs:
 *
 *  1. Time-series: viewer counts per roster streamer/platform plus relay load, written to
 *     stat_samples every minute while anyone is live (every 5 minutes idle). Sampled through
 *     the app's own /api routes so it reuses their caching and Helix/GQL/scrape fallbacks.
 *
 *  2. Durable chatter leaderboard: the relay tallies Twitch/Kick chatters in memory (backed by
 *     its own JSON file). We mirror them into the chatters table by *delta*: each sync adds
 *     `current - last_seen` per name, so counts keep accumulating across app and relay restarts
 *     instead of being overwritten by whatever the relay currently remembers. X chatters never
 *     pass through the relay — chat-buffer.ts accumulates them per message directly.
 *
 * Server-only; started once from instrumentation.ts.
 */

import type { Streamer } from "@/lib/streamers/mock";
import { getDb, type Statement } from "./db";

const LIVE_SAMPLE_MS = 60_000;
const IDLE_SAMPLE_MS = 5 * 60_000;
const RETENTION_MS = 90 * 24 * 3600_000;
const PRUNE_EVERY_MS = 24 * 3600_000;

interface StreamStatus {
  live: boolean | null;
  viewerCount?: number;
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** One sampling pass. Returns whether any roster stream was live (drives the cadence). */
async function sampleOnce(roster: Streamer[], log: (l: string) => void): Promise<boolean> {
  const db = getDb();
  if (!db) return false;

  const ts = Date.now();
  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const rows: Array<[string, number]> = [];
  let anyLive = false;

  for (const s of roster) {
    if (s.platforms.includes("twitch")) {
      const handle = s.handles.twitch ?? s.id;
      const d = await getJson<StreamStatus>(`${base}/api/twitch/stream?login=${encodeURIComponent(handle)}`);
      if (d && d.live !== null) {
        rows.push([`viewers:twitch:${s.id}`, d.live ? (d.viewerCount ?? 0) : 0]);
        anyLive ||= d.live;
      }
    }
    if (s.platforms.includes("kick")) {
      const handle = s.handles.kick ?? s.id;
      const d = await getJson<StreamStatus>(`${base}/api/kick/stream?slug=${encodeURIComponent(handle)}`);
      if (d && d.live !== null) {
        rows.push([`viewers:kick:${s.id}`, d.live ? (d.viewerCount ?? 0) : 0]);
        anyLive ||= d.live;
      }
    }
  }

  const relayUrl = (process.env.RELAY_URL || "").replace(/\/$/, "");
  if (relayUrl) {
    const health = await getJson<{ clients?: number; mps?: number }>(`${relayUrl}/health`);
    if (health) {
      rows.push(["relay:clients", health.clients ?? 0]);
      rows.push(["relay:mps", health.mps ?? 0]);
    }

    const top = await getJson<{ chatters?: Array<{ name: string; platform: string; count: number; sub?: boolean }> }>(
      `${relayUrl}/top-chatters?limit=500`,
    );
    if (top?.chatters) await syncRelayChatters(top.chatters, log);
  }

  if (rows.length) {
    try {
      await db.batch(
        rows.map(([metric, value]) => ({
          sql: "INSERT INTO stat_samples (ts, metric, value) VALUES (?, ?, ?)",
          params: [ts, metric, value],
        })),
      );
    } catch (err) {
      log(`sample insert failed: ${err}`);
    }
  }

  return anyLive;
}

/** Mirror relay tallies into the chatters table by delta (X is accumulated elsewhere). */
async function syncRelayChatters(
  list: Array<{ name: string; platform: string; count: number; sub?: boolean }>,
  log: (l: string) => void,
) {
  const db = getDb();
  if (!db) return;

  // Filter to valid Twitch/Kick rows up front, so we don't query the DB for noise.
  const valid = list.filter((c) => c.platform !== "x" && c.name && Number.isFinite(c.count));
  if (valid.length === 0) return;

  try {
    // One read for all rows we might touch (much cheaper than N round-trips on Turso).
    const prevRows = await db.all<{ platform: string; name: string; count: number; source_count: number }>(
      "SELECT platform, name, count, source_count FROM chatters WHERE platform IN ('twitch', 'kick')",
    );
    const prev = new Map(prevRows.map((r) => [`${r.platform}|${r.name}`, r]));

    const now = Date.now();
    const stmts: Statement[] = valid.map((c) => {
      const key = `${c.platform}|${c.name}`;
      const p = prev.get(key);
      // Delta against the last tally we saw; a shrunk tally means the relay reset (lost its
      // file), so everything it now reports is new messages on top of what we banked.
      const count = !p
        ? c.count
        : c.count >= p.source_count
          ? p.count + (c.count - p.source_count)
          : p.count + c.count;
      return {
        sql: `INSERT INTO chatters (platform, name, count, source_count, sub, updated_at) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(platform, name) DO UPDATE SET
                count = excluded.count, source_count = excluded.source_count,
                sub = MAX(chatters.sub, excluded.sub), updated_at = excluded.updated_at`,
        params: [c.platform, c.name, count, c.count, c.sub ? 1 : 0, now],
      };
    });
    await db.batch(stmts);
  } catch (err) {
    log(`chatter sync failed: ${err}`);
  }
}

async function prune(log: (l: string) => void) {
  const db = getDb();
  if (!db) return;
  try {
    await db.run("DELETE FROM stat_samples WHERE ts < ?", [Date.now() - RETENTION_MS]);
  } catch (err) {
    log(`prune failed: ${err}`);
  }
}

/** Start the sampling loop (call once at boot, only when the database is enabled). */
export function startStatsSampler(roster: Streamer[], log = (l: string) => console.log(`[stats] ${l}`)): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  void prune(log);
  const pruneTimer = setInterval(() => void prune(log), PRUNE_EVERY_MS);

  const tick = async () => {
    if (stopped) return;
    let anyLive = false;
    try {
      anyLive = await sampleOnce(roster, log);
    } catch (err) {
      log(`sample failed: ${err}`);
    }
    if (!stopped) timer = setTimeout(tick, anyLive ? LIVE_SAMPLE_MS : IDLE_SAMPLE_MS);
  };

  // First sample after one live-interval — the HTTP server isn't listening yet at boot.
  timer = setTimeout(tick, LIVE_SAMPLE_MS);
  log(`sampler started (${roster.length} roster entries, ${RETENTION_MS / 86_400_000}d retention)`);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    clearInterval(pruneTimer);
  };
}

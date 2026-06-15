/**
 * In-process Twitch IRC + Kick Pusher tally — the single-service alternative to the relay
 * for the durable-leaderboard use case. Closes the gap where a deploy without a relay only
 * ever saw X tallies (X is in-process per message via chat-buffer.ts) and never Twitch/Kick.
 *
 * Activation: started from instrumentation.ts ONLY when RELAY_URL is empty, so the relay
 * path and this path are mutually exclusive — no double-counting either way.
 *
 * Pipeline:
 *  - One anonymous WebSocket per platform, joining every roster channel on it.
 *  - Each accepted PRIVMSG / ChatMessageEvent increments `pending[platform|lowername]`.
 *  - Every FLUSH_MS, if a database is configured, deltas batch-flush into the chatters table
 *    (INSERT … ON CONFLICT DO UPDATE SET count = count + excluded.count). `pending` clears.
 *  - With no database, `pending` keeps accumulating session-long, and the leaderboard route
 *    reads it directly via getInProcessTopChatters() — same shape as the relay's
 *    /top-chatters response.
 *
 * Memory caps mirror the relay: at most CHATTERS_MAX distinct entries; when overflowing,
 * the smallest-count entry is evicted (cheap and biased toward keeping the actual top).
 */

import type { Streamer } from "@/lib/streamers/mock";
import { kickApiJson } from "@/lib/server/kick-fetch";
import { getDb } from "./db";

const FLUSH_MS = 30_000;
const CHATTERS_MAX = 500;
const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_CLUSTER = "us2";
/** How often to retry Kick chatroom resolution when the initial attempt resolved nothing.
 *  Stops as soon as anything resolves; one transient Cloudflare 403 at boot shouldn't lose
 *  Kick chat for the whole process lifetime. */
const KICK_RESOLVE_RETRY_MS = 5 * 60_000;

/** Chat bots never belong on a human leaderboard. Mirrors the relay's set. */
const BOTS = new Set([
  "nightbot", "streamelements", "fossabot", "moobot", "wizebot", "sery_bot", "botrix", "kickbot",
  "streamlabs", "soundalerts", "pokemoncommunitygame",
]);

interface Tally {
  name: string;
  platform: "twitch" | "kick";
  count: number;
  sub: boolean;
}

interface ListenerStore {
  started: boolean;
  pending: Map<string, Tally>;
  twitchSocket: WebSocket | null;
  kickSocket: WebSocket | null;
  flushTimer: ReturnType<typeof setInterval> | null;
}

const store: ListenerStore = ((globalThis as Record<string, unknown> & { __mbChatListener?: ListenerStore }).__mbChatListener ??= {
  started: false,
  pending: new Map(),
  twitchSocket: null,
  kickSocket: null,
  flushTimer: null,
});

function tally(platform: "twitch" | "kick", name: string, isSub: boolean) {
  const trimmed = (name || "").trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  if (lower === "anon" || BOTS.has(lower)) return;
  const key = `${platform}:${lower}`;
  const cur = store.pending.get(key);
  if (cur) {
    cur.count += 1;
    if (isSub) cur.sub = true;
    return;
  }
  store.pending.set(key, { name: trimmed, platform, count: 1, sub: isSub });
  // Evict the smallest-count entry when we hit the cap. Cheap O(n) — n is bounded at
  // CHATTERS_MAX and this only fires once per overflow.
  if (store.pending.size > CHATTERS_MAX) {
    let minKey: string | null = null;
    let min = Infinity;
    for (const [k, v] of store.pending) {
      if (v.count < min) {
        min = v.count;
        minKey = k;
      }
    }
    if (minKey) store.pending.delete(minKey);
  }
}

/** Top chatters as a snapshot of the in-memory pending tally. Used by the leaderboard's
 *  no-database fallback (the DB path reads the durable chatters table directly). */
export function getInProcessTopChatters(limit = 15): Array<{ name: string; platform: "twitch" | "kick"; count: number; sub: boolean }> {
  return [...store.pending.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((t) => ({ name: t.name, platform: t.platform, count: t.count, sub: t.sub }));
}

function flush(log: (l: string) => void) {
  if (store.pending.size === 0) return;
  const db = getDb();
  if (!db) return; // no-DB mode → accumulate in pending forever (capped at CHATTERS_MAX)

  // Snapshot + clear synchronously, before any DB work, so messages arriving during this
  // function go into a fresh pending map and the next flush picks them up.
  const snapshot = [...store.pending.values()];
  store.pending = new Map();

  try {
    const up = db.prepare(
      `INSERT INTO chatters (platform, name, count, source_count, sub, updated_at) VALUES (?, ?, ?, 0, ?, ?)
       ON CONFLICT(platform, name) DO UPDATE SET
         count = count + excluded.count,
         sub = MAX(chatters.sub, excluded.sub),
         updated_at = excluded.updated_at`,
    );
    const now = Date.now();
    db.exec("BEGIN");
    for (const t of snapshot) up.run(t.platform, t.name, t.count, t.sub ? 1 : 0, now);
    db.exec("COMMIT");
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* not in a transaction */
    }
    // Re-queue the deltas so the next flush retries instead of losing them.
    for (const t of snapshot) {
      const key = `${t.platform}:${t.name.toLowerCase()}`;
      const existing = store.pending.get(key);
      if (existing) existing.count += t.count;
      else store.pending.set(key, t);
    }
    log(`flush failed (deltas re-queued): ${err}`);
  }
}

// ── Twitch IRC ─────────────────────────────────────────────────────────────────

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    tags[part.slice(0, i)] = part.slice(i + 1);
  }
  return tags;
}

function isTwitchSub(badges: string | undefined): boolean {
  if (!badges) return false;
  for (const b of badges.split(",")) if (b.startsWith("subscriber/")) return true;
  return false;
}

function connectTwitch(logins: string[], log: (l: string) => void) {
  if (logins.length === 0) return;
  const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
  store.twitchSocket = ws;
  ws.onopen = () => {
    ws.send("PASS SCHMOOPIIE");
    ws.send("NICK justinfan" + Math.floor(Math.random() * 80000 + 1000));
    ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
    ws.send("JOIN " + logins.map((l) => "#" + l.toLowerCase()).join(","));
    log(`twitch: joined ${logins.length} channel(s)`);
  };
  ws.onmessage = (e) => {
    for (const line of String(e.data).split("\r\n")) {
      if (!line) continue;
      if (line.startsWith("PING")) {
        ws.send("PONG :tmi.twitch.tv");
        continue;
      }
      // Lightweight parse — we only need the message command, the display-name tag, and the
      // subscriber badge. No need to extract the body or source channel for tallying.
      let rest = line;
      let tags: Record<string, string> = {};
      if (rest[0] === "@") {
        const sp = rest.indexOf(" ");
        tags = parseTags(rest.slice(1, sp));
        rest = rest.slice(sp + 1);
      }
      let prefix = "";
      if (rest[0] === ":") {
        const sp = rest.indexOf(" ");
        prefix = rest.slice(1, sp);
        rest = rest.slice(sp + 1);
      }
      const sp = rest.indexOf(" ");
      const command = sp === -1 ? rest : rest.slice(0, sp);
      if (command !== "PRIVMSG") continue;
      const name = tags["display-name"] || prefix.split("!")[0];
      if (!name) continue;
      tally("twitch", name, isTwitchSub(tags.badges));
    }
  };
  ws.onclose = () => {
    if (store.twitchSocket === ws) {
      log("twitch: socket closed, reconnecting in 4s");
      setTimeout(() => connectTwitch(logins, log), 4000);
    }
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  };
}

// ── Kick Pusher ────────────────────────────────────────────────────────────────

interface KickResolved {
  slug: string;
  chatroomId: number;
}

/** Resolve each roster Kick handle to its chatroom id via the same path the /api/kick/channel
 *  route uses (curl-backed to bypass Cloudflare). Unresolved handles are skipped with a log. */
async function resolveKickChatrooms(slugs: string[], log: (l: string) => void): Promise<KickResolved[]> {
  const out: KickResolved[] = [];
  for (const slug of slugs) {
    try {
      const data = await kickApiJson<{ chatroom?: { id?: number } }>(`v2/channels/${encodeURIComponent(slug)}`, 3600);
      const id = data?.chatroom?.id;
      if (id) {
        out.push({ slug, chatroomId: id });
      } else {
        log(`kick: ${slug} — no chatroom id, skipping`);
      }
    } catch (err) {
      log(`kick: ${slug} lookup failed (${err}), skipping`);
    }
  }
  return out;
}

function isKickSub(badges: Array<{ type?: string }> | undefined): boolean {
  if (!Array.isArray(badges)) return false;
  for (const b of badges) {
    const t = String(b.type || "").toUpperCase();
    if (t === "SUB" || t === "SUBSCRIBER") return true;
  }
  return false;
}

function connectKick(chatrooms: KickResolved[], log: (l: string) => void) {
  if (chatrooms.length === 0) return;
  const url = `wss://ws-${KICK_PUSHER_CLUSTER}.pusher.com/app/${KICK_PUSHER_KEY}?protocol=7&client=js&version=8.4.0&flash=false`;
  const ws = new WebSocket(url);
  store.kickSocket = ws;
  ws.onmessage = (e) => {
    let frame: { event?: string; data?: unknown };
    try {
      frame = JSON.parse(String(e.data));
    } catch {
      return;
    }
    if (frame.event === "pusher:connection_established") {
      for (const c of chatrooms) {
        ws.send(JSON.stringify({ event: "pusher:subscribe", data: { auth: "", channel: `chatrooms.${c.chatroomId}.v2` } }));
      }
      log(`kick: subscribed to ${chatrooms.length} chatroom(s)`);
      return;
    }
    // Pusher pings the client every ~120s; without a pong it tears the connection down.
    // Reply immediately so the socket stays open instead of cycling every couple of minutes.
    if (frame.event === "pusher:ping") {
      try {
        ws.send(JSON.stringify({ event: "pusher:pong", data: "" }));
      } catch {
        /* socket already closing */
      }
      return;
    }
    if (frame.event === "App\\Events\\ChatMessageEvent") {
      let d: { sender?: { username?: string; identity?: { badges?: Array<{ type?: string }> } } };
      try {
        d = JSON.parse(String(frame.data));
      } catch {
        return;
      }
      const name = d?.sender?.username;
      if (!name) return;
      tally("kick", name, isKickSub(d.sender?.identity?.badges));
    }
  };
  ws.onclose = () => {
    if (store.kickSocket === ws) {
      log("kick: socket closed, reconnecting in 5s");
      setTimeout(() => connectKick(chatrooms, log), 5000);
    }
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch {
      /* already closing */
    }
  };
}

// ── Entry point ────────────────────────────────────────────────────────────────

/**
 * Start the in-process listener. Idempotent. Pulls Twitch logins and Kick slugs out of the
 * roster, opens one socket per platform, and begins the flush loop. Safe to call when no
 * channels are configured for a platform — that platform's connect call is a no-op.
 */
export async function startChatListener(roster: Streamer[], log = (l: string) => console.log(`[chat-listener] ${l}`)) {
  if (store.started) return;
  store.started = true;

  const twitchLogins = roster.map((s) => s.handles.twitch).filter((h): h is string => !!h);
  const kickSlugs = roster.map((s) => s.handles.kick).filter((h): h is string => !!h);

  if (twitchLogins.length) connectTwitch(twitchLogins, log);

  if (kickSlugs.length) {
    // Chatroom resolution is async — kick this off so the listener boots without blocking
    // instrumentation. Failures are per-slug; we still subscribe to whatever resolves.
    // If the initial attempt resolves nothing (Kick API rate-limit / Cloudflare 403 at boot),
    // retry every KICK_RESOLVE_RETRY_MS until at least one chatroom comes back — otherwise
    // a single boot-time hiccup would turn the whole process into twitch-only.
    let attempt = 0;
    const tryResolve = async () => {
      attempt++;
      const resolved = await resolveKickChatrooms(kickSlugs, log);
      if (resolved.length) {
        log(`kick: resolved ${resolved.length}/${kickSlugs.length} chatroom(s) (attempt ${attempt})`);
        connectKick(resolved, log);
        return true;
      }
      return false;
    };
    void tryResolve().then((ok) => {
      if (ok) return;
      log(`kick: no chatroom ids resolved on boot — retrying every ${KICK_RESOLVE_RETRY_MS / 60_000}min`);
      const retry = setInterval(async () => {
        if (await tryResolve()) clearInterval(retry);
      }, KICK_RESOLVE_RETRY_MS);
    });
  }

  store.flushTimer = setInterval(() => flush(log), FLUSH_MS);
  log(`started (twitch: ${twitchLogins.length}, kick handles: ${kickSlugs.length})`);
}

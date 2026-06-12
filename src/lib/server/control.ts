/**
 * Control plane for the live dashboard: the announcement banner, runtime feature flags, and
 * the active poll. One Node process — admin actions mutate this in-memory store and every
 * connected viewer gets the change pushed over the control SSE stream.
 *
 * Persistence is optional (DATABASE_PATH → SQLite): when present the store hydrates from it at
 * boot and writes through on every change, so announcements/flags/roster/filters/polls survive
 * restarts; when absent everything is memory-only and resets with the process. Same features
 * either way — the database only adds durability.
 *
 * Scale notes (the site can hold thousands of viewers):
 *  - Broadcasts are full snapshots, throttled: state-shaped changes (publish, lock, clear) flush
 *    immediately; high-frequency vote tallies coalesce to at most one frame per second.
 *  - Vote dedup is an in-memory map per poll (capped); votes are re-votable until lock.
 *  - Chat votes are tallied by the relay (the single server-side chat connection) and merged
 *    here on a short interval — one internal request, not one per viewer.
 */

import type { StreamSchedule } from "@/lib/streamers/schedule";
import { getDb } from "./db";

export interface Announcement {
  message: string;
  setAt: number;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number; // site clicks
  chatVotes: number; // tallied by the relay from Twitch/Kick chat
}

export interface Poll {
  id: string;
  question: string;
  source: "custom" | "polymarket";
  options: PollOption[];
  createdAt: number;
  endsAt: number | null;
  status: "open" | "locked";
  /** Winning option id once locked; null while open or on a tie. */
  winner: string | null;
}

/** Minimal streamer shape for live roster overrides (mirrors the client Streamer type). */
export interface RosterStreamer {
  id: string;
  name: string;
  handles: { twitch?: string; kick?: string; x?: string };
  platforms: string[];
  live: boolean;
  viewers: number;
  title: string;
  /** Operator-pinned: sorted to the top of the sidebar and visually highlighted. */
  pinned?: boolean;
  /** Weekly slot (Pacific Time) — drives countdowns and discovery polling, editable in admin. */
  schedule?: StreamSchedule;
}

/**
 * Operator-set chat filter, pushed to every viewer. Same shape as the client's local FilterRule
 * so both run through the one filter engine: mutes drop matching messages for everyone,
 * highlights emphasize them (e.g. the hosts' own messages).
 */
export interface GlobalFilter {
  id: string;
  pattern: string;
  action: "highlight" | "mute";
  field: "text" | "author";
}

/**
 * A running (or finished) giveaway roll. The winner is decided server-side at start; clients
 * (admin page and OBS overlay) replay the same deterministic deceleration over `names`, landing
 * on `winner` at startedAt + durationMs — so every screen shows the identical roll.
 */
export interface Giveaway {
  id: string;
  /** Reel entries (a sample of eligible chatters, winner included). */
  names: string[];
  winner: string;
  /** Platform of the winning chatter ("twitch" | "kick" | "x"). */
  winnerPlatform: string;
  /** How many chatters were eligible under the filters used. */
  eligible: number;
  startedAt: number;
  durationMs: number;
}

export interface ControlState {
  announcement: Announcement | null;
  /** Runtime feature overrides; a missing key means "enabled". */
  flags: Record<string, boolean>;
  poll: Poll | null;
  /** Live roster override (replaces the file roster while set); null = use the configured roster. */
  roster: RosterStreamer[] | null;
  /** Operator chat filters, applied on every viewer's feed ahead of their own rules. */
  filters: GlobalFilter[];
  /** Active giveaway roll (or its result, until cleared); null = none. */
  giveaway: Giveaway | null;
}

const MAX_VOTERS = 100_000;
const TALLY_BROADCAST_MS = 1000;
const RELAY_PULL_MS = 2500;

/**
 * All mutable state lives in one store stashed on globalThis. Next can instantiate this module
 * once per route bundle (and again after dev hot reloads); without the stash each API route
 * would mutate its own copy and SSE listeners would miss broadcasts from other routes.
 */
interface ControlStore {
  announcement: Announcement | null;
  flags: Record<string, boolean>;
  poll: Poll | null;
  roster: RosterStreamer[] | null;
  globalFilters: GlobalFilter[];
  giveaway: Giveaway | null;
  voters: Map<string, string>; // voterKey → optionId (current poll only)
  lockTimer: ReturnType<typeof setTimeout> | null;
  relayPull: ReturnType<typeof setInterval> | null;
  listeners: Set<(s: ControlState) => void>;
  pendingBroadcast: ReturnType<typeof setTimeout> | null;
  lastBroadcast: number;
  /** Whether a database-restored open poll has had its timers/relay re-armed. */
  pollResumed: boolean;
}

const store: ControlStore = ((globalThis as Record<string, unknown> & { __mbControlStore?: ControlStore }).__mbControlStore ??= hydrate({
  announcement: null,
  flags: {},
  poll: null,
  roster: null,
  globalFilters: [],
  giveaway: null,
  voters: new Map(),
  lockTimer: null,
  relayPull: null,
  listeners: new Set(),
  pendingBroadcast: null,
  lastBroadcast: 0,
  pollResumed: false,
}));

resumePersistedPoll();

// ── Persistence (optional SQLite) ──────────────────────────────────────────────
// With DATABASE_PATH set, control state survives restarts: scalar state lives as JSON in
// control_kv, polls as rows (rows outlive clearPoll — that's the poll history for future
// analytics), and per-voter choices in poll_voters so a restart can't double-count re-votes.
// Without a database every helper is a no-op and the store behaves exactly as before.
// Write path: votes persist individually (dedup must be exact); everything else piggybacks
// on broadcast()'s send — already throttled to one frame per second during tallies.

function hydrate(s: ControlStore): ControlStore {
  const db = getDb();
  if (!db) return s;
  try {
    const rows = db.prepare("SELECT key, value FROM control_kv").all() as { key: string; value: string }[];
    const kv = new Map(rows.map((r) => [r.key, r.value]));
    const read = <T,>(key: string, fallback: T): T => {
      const raw = kv.get(key);
      if (raw === undefined) return fallback;
      try {
        return (JSON.parse(raw) as T) ?? fallback;
      } catch {
        return fallback;
      }
    };

    s.announcement = read<Announcement | null>("announcement", null);
    s.flags = read<Record<string, boolean>>("flags", {});
    s.roster = read<RosterStreamer[] | null>("roster", null);
    s.globalFilters = read<GlobalFilter[]>("filters", []);
    s.giveaway = read<Giveaway | null>("giveaway", null);

    const pollId = read<string | null>("current_poll_id", null);
    if (pollId) {
      const row = db.prepare("SELECT * FROM polls WHERE id = ?").get(pollId) as
        | { id: string; question: string; source: string; options: string; created_at: number; ends_at: number | null; status: string; winner: string | null }
        | undefined;
      if (row) {
        s.poll = {
          id: row.id,
          question: row.question,
          source: row.source === "polymarket" ? "polymarket" : "custom",
          options: JSON.parse(row.options) as PollOption[],
          createdAt: row.created_at,
          endsAt: row.ends_at,
          status: row.status === "locked" ? "locked" : "open",
          winner: row.winner,
        };
        const voters = db.prepare("SELECT voter_key, option_id FROM poll_voters WHERE poll_id = ?").all(pollId) as { voter_key: string; option_id: string }[];
        s.voters = new Map(voters.map((v) => [v.voter_key, v.option_id]));
      }
    }
  } catch (err) {
    console.error("[control] failed to hydrate from database; starting empty", err);
  }
  return s;
}

/**
 * Re-arms what hydrate() couldn't (it runs before `store` exists): the lock timer and relay
 * registration for a restored open poll. Runs once per process; locks immediately when the
 * poll expired while the server was down.
 */
function resumePersistedPoll() {
  if (store.pollResumed) return;
  store.pollResumed = true;
  const poll = store.poll;
  if (!poll || poll.status !== "open") return;
  if (poll.endsAt && poll.endsAt <= Date.now()) {
    lockPoll();
    return;
  }
  if (poll.endsAt && !store.lockTimer) {
    store.lockTimer = setTimeout(() => lockPoll(), poll.endsAt - Date.now());
  }
  if (!store.relayPull) startRelayVotes(poll);
}

function persistState() {
  const db = getDb();
  if (!db) return;
  try {
    const up = db.prepare(
      "INSERT INTO control_kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    up.run("announcement", JSON.stringify(store.announcement));
    up.run("flags", JSON.stringify(store.flags));
    up.run("roster", JSON.stringify(store.roster));
    up.run("filters", JSON.stringify(store.globalFilters));
    up.run("giveaway", JSON.stringify(store.giveaway));
    up.run("current_poll_id", JSON.stringify(store.poll?.id ?? null));

    const p = store.poll;
    if (p) {
      db.prepare(
        `INSERT INTO polls (id, question, source, options, created_at, ends_at, status, winner)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           options = excluded.options, ends_at = excluded.ends_at,
           status = excluded.status, winner = excluded.winner`,
      ).run(p.id, p.question, p.source, JSON.stringify(p.options), p.createdAt, p.endsAt, p.status, p.winner);
    }
  } catch (err) {
    console.error("[control] persist failed", err);
  }
}

function persistVote(pollId: string, voterKey: string, optionId: string) {
  const db = getDb();
  if (!db) return;
  try {
    db.prepare(
      "INSERT INTO poll_voters (poll_id, voter_key, option_id) VALUES (?, ?, ?) ON CONFLICT(poll_id, voter_key) DO UPDATE SET option_id = excluded.option_id",
    ).run(pollId, voterKey, optionId);
  } catch (err) {
    console.error("[control] vote persist failed", err);
  }
}

export function getControlState(): ControlState {
  return {
    announcement: store.announcement,
    flags: { ...store.flags },
    poll: store.poll ? { ...store.poll, options: store.poll.options.map((o) => ({ ...o })) } : null,
    roster: store.roster,
    filters: store.globalFilters,
    giveaway: store.giveaway,
  };
}

export function subscribeControl(cb: (s: ControlState) => void): () => void {
  store.listeners.add(cb);
  return () => store.listeners.delete(cb);
}

function broadcast(immediate = false) {
  const send = () => {
    store.lastBroadcast = Date.now();
    persistState(); // every state change flows through here, already throttled for tallies
    const snapshot = getControlState();
    for (const l of store.listeners) l(snapshot);
  };
  if (immediate) {
    if (store.pendingBroadcast) {
      clearTimeout(store.pendingBroadcast);
      store.pendingBroadcast = null;
    }
    send();
    return;
  }
  if (store.pendingBroadcast) return;
  const wait = Math.max(0, TALLY_BROADCAST_MS - (Date.now() - store.lastBroadcast));
  store.pendingBroadcast = setTimeout(() => {
    store.pendingBroadcast = null;
    send();
  }, wait);
}

// ── Announcement ───────────────────────────────────────────────────────────────

export function getAnnouncement(): Announcement | null {
  return store.announcement;
}

export function setAnnouncement(message: string) {
  const trimmed = message.trim().slice(0, 280);
  store.announcement = trimmed ? { message: trimmed, setAt: Date.now() } : null;
  broadcast(true);
}

export function clearAnnouncement() {
  store.announcement = null;
  broadcast(true);
}

// ── Feature flags ──────────────────────────────────────────────────────────────

export function setFlag(key: string, enabled: boolean) {
  const safe = key.trim().toLowerCase().slice(0, 40);
  if (!safe) return;
  if (enabled) delete store.flags[safe];
  else store.flags[safe] = false;
  broadcast(true);
}

// ── Roster override ────────────────────────────────────────────────────────────

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);

/**
 * Replaces the dashboard roster live (or clears the override with null). Validated and
 * normalized here; the client merges in live status the same way it does for the file roster.
 */
export function setRoster(
  entries:
    | {
        name?: string;
        handles?: { twitch?: string; kick?: string; x?: string };
        pinned?: boolean;
        schedule?: { label?: string; weekday?: number; hour?: number } | null;
      }[]
    | null,
) {
  if (entries === null) {
    store.roster = null;
    broadcast(true);
    return;
  }
  const cleaned: RosterStreamer[] = [];
  const seen = new Set<string>();
  for (const e of entries.slice(0, 12)) {
    const name = String(e.name ?? "").trim().slice(0, 40);
    const handles = {
      twitch: slug(String(e.handles?.twitch ?? "")) || undefined,
      kick: slug(String(e.handles?.kick ?? "")) || undefined,
      x: String(e.handles?.x ?? "").trim().replace(/^@/, "").slice(0, 30) || undefined,
    };
    if (!name || (!handles.twitch && !handles.kick && !handles.x)) continue;
    const id = handles.twitch || handles.kick || slug(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const platforms: string[] = [];
    if (handles.twitch) platforms.push("twitch");
    if (handles.kick) platforms.push("kick");
    if (handles.x) platforms.push("x");
    let schedule: StreamSchedule | undefined;
    const sch = e.schedule;
    if (
      sch &&
      Number.isInteger(sch.weekday) && sch.weekday! >= 0 && sch.weekday! <= 6 &&
      Number.isInteger(sch.hour) && sch.hour! >= 0 && sch.hour! <= 23
    ) {
      const days = ["SUNDAYS", "MONDAYS", "TUESDAYS", "WEDNESDAYS", "THURSDAYS", "FRIDAYS", "SATURDAYS"];
      const h = sch.hour!;
      const fallback = `${days[sch.weekday!]} ${h % 12 === 0 ? 12 : h % 12}${h < 12 ? "AM" : "PM"} PT`;
      schedule = { label: String(sch.label ?? "").trim().slice(0, 40) || fallback, weekday: sch.weekday!, hour: h };
    }
    cleaned.push({ id, name, handles, platforms, live: false, viewers: 0, title: "", pinned: e.pinned === true, schedule });
  }
  if (cleaned.length === 0) throw new Error("roster needs at least one streamer with a handle");
  store.roster = cleaned;
  broadcast(true);
}

// ── Global chat filters ────────────────────────────────────────────────────────

/**
 * Replaces the operator filter set (empty array or null clears it). Normalized here; clients
 * apply these ahead of each viewer's own rules through the same filter engine.
 */
export function setGlobalFilters(entries: { pattern?: string; action?: string; field?: string }[] | null) {
  const cleaned: GlobalFilter[] = [];
  for (const e of (entries ?? []).slice(0, 20)) {
    const pattern = String(e.pattern ?? "").trim().slice(0, 60);
    if (!pattern) continue;
    cleaned.push({
      id: `gf${cleaned.length + 1}`,
      pattern,
      action: e.action === "highlight" ? "highlight" : "mute",
      field: e.field === "author" ? "author" : "text",
    });
  }
  store.globalFilters = cleaned;
  broadcast(true);
}

// ── Poll lifecycle ─────────────────────────────────────────────────────────────

export function startPoll(question: string, optionLabels: string[], durationSec: number | null, source: "custom" | "polymarket"): Poll {
  const q = question.trim().slice(0, 200);
  const labels = optionLabels.map((l) => l.trim().slice(0, 60)).filter(Boolean).slice(0, 4);
  if (!q || labels.length < 2) throw new Error("a poll needs a question and 2–4 options");

  stopPollMachinery();
  store.voters = new Map();
  store.poll = {
    id: `poll_${Date.now().toString(36)}`,
    question: q,
    source,
    options: labels.map((label, i) => ({ id: String(i + 1), label, votes: 0, chatVotes: 0 })),
    createdAt: Date.now(),
    endsAt: durationSec && durationSec > 0 ? Date.now() + Math.min(durationSec, 3600) * 1000 : null,
    status: "open",
    winner: null,
  };
  if (store.poll.endsAt) {
    store.lockTimer = setTimeout(() => lockPoll(), store.poll.endsAt - Date.now());
  }
  startRelayVotes(store.poll);
  broadcast(true);
  return store.poll;
}

/** Site vote (a click on the dashboard). Re-votable until locked; deduped per voter key. */
export function votePoll(pollId: string, optionId: string, voterKey: string): Poll {
  const poll = store.poll;
  if (!poll || poll.id !== pollId) throw new Error("no such poll");
  if (poll.status === "locked" || (poll.endsAt && Date.now() > poll.endsAt)) {
    if (poll.status !== "locked") lockPoll();
    throw new Error("voting has closed");
  }
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) throw new Error("no such option");
  if (store.voters.size >= MAX_VOTERS && !store.voters.has(voterKey)) throw new Error("vote limit reached");

  const previous = store.voters.get(voterKey);
  if (previous === optionId) return poll;
  if (previous) {
    const prev = poll.options.find((o) => o.id === previous);
    if (prev && prev.votes > 0) prev.votes -= 1;
  }
  option.votes += 1;
  store.voters.set(voterKey, optionId);
  persistVote(poll.id, voterKey, optionId);
  broadcast(); // throttled — tallies coalesce
  return poll;
}

export function lockPoll() {
  const poll = store.poll;
  if (!poll || poll.status === "locked") return;
  stopPollMachinery();
  poll.status = "locked";
  poll.endsAt = poll.endsAt && poll.endsAt < Date.now() ? poll.endsAt : Date.now();
  const totals = poll.options.map((o) => o.votes + o.chatVotes);
  const max = Math.max(...totals);
  const leaders = poll.options.filter((o) => o.votes + o.chatVotes === max);
  poll.winner = max > 0 && leaders.length === 1 ? leaders[0].id : null; // null = tie or no votes
  broadcast(true);
}

export function clearPoll() {
  stopPollMachinery();
  store.poll = null;
  store.voters = new Map();
  broadcast(true);
}

function stopPollMachinery() {
  if (store.lockTimer) {
    clearTimeout(store.lockTimer);
    store.lockTimer = null;
  }
  if (store.relayPull) {
    clearInterval(store.relayPull);
    store.relayPull = null;
  }
  void relayDelete();
}

// ── Giveaway ───────────────────────────────────────────────────────────────────

/** Publishes a giveaway roll to every client (the route picks the winner; this just broadcasts). */
export function startGiveaway(g: Omit<Giveaway, "id" | "startedAt">): Giveaway {
  store.giveaway = { ...g, id: `ga_${Date.now().toString(36)}`, startedAt: Date.now() };
  broadcast(true);
  return store.giveaway;
}

export function clearGiveaway() {
  store.giveaway = null;
  broadcast(true);
}

// ── Chat votes via the relay ───────────────────────────────────────────────────
// The relay holds the one server-side connection to the roster's Twitch/Kick chat, so it is the
// single authority for chat votes: we register the poll there and pull merged counts.

function relayUrl(): string | null {
  const url = (process.env.RELAY_URL || "").replace(/\/$/, "");
  return url || null;
}

function startRelayVotes(p: Poll) {
  const relay = relayUrl();
  if (!relay) return;
  const spec = {
    id: p.id,
    options: p.options.map((o) => ({ id: o.id, keywords: [o.id, o.label.toLowerCase()] })),
  };
  fetch(`${relay}/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(spec),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});

  store.relayPull = setInterval(() => {
    fetch(`${relay}/poll-votes`, { cache: "no-store", signal: AbortSignal.timeout(3000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { id?: string; counts?: Record<string, number> } | null) => {
        const poll = store.poll;
        if (!data || !poll || data.id !== poll.id || poll.status === "locked") return;
        let changed = false;
        for (const o of poll.options) {
          const n = data.counts?.[o.id] ?? 0;
          if (n !== o.chatVotes) {
            o.chatVotes = n;
            changed = true;
          }
        }
        if (changed) broadcast();
      })
      .catch(() => {});
  }, RELAY_PULL_MS);
}

async function relayDelete() {
  const relay = relayUrl();
  if (!relay) return;
  try {
    await fetch(`${relay}/poll`, { method: "DELETE", signal: AbortSignal.timeout(3000) });
  } catch {
    /* relay unreachable — its poll spec expires with the next POST anyway */
  }
}

/**
 * In-memory control plane for the live dashboard: the announcement banner, runtime feature
 * flags, and the active poll. One Node process, no database — admin actions mutate this store
 * and every connected viewer gets the change pushed over the control SSE stream.
 *
 * Scale notes (the site can hold thousands of viewers):
 *  - Broadcasts are full snapshots, throttled: state-shaped changes (publish, lock, clear) flush
 *    immediately; high-frequency vote tallies coalesce to at most one frame per second.
 *  - Vote dedup is an in-memory map per poll (capped); votes are re-votable until lock.
 *  - Chat votes are tallied by the relay (the single server-side chat connection) and merged
 *    here on a short interval — one internal request, not one per viewer.
 */

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

export interface ControlState {
  announcement: Announcement | null;
  /** Runtime feature overrides; a missing key means "enabled". */
  flags: Record<string, boolean>;
  poll: Poll | null;
  /** Live roster override (replaces the file roster while set); null = use the configured roster. */
  roster: RosterStreamer[] | null;
  /** Operator chat filters, applied on every viewer's feed ahead of their own rules. */
  filters: GlobalFilter[];
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
  voters: Map<string, string>; // voterKey → optionId (current poll only)
  lockTimer: ReturnType<typeof setTimeout> | null;
  relayPull: ReturnType<typeof setInterval> | null;
  listeners: Set<(s: ControlState) => void>;
  pendingBroadcast: ReturnType<typeof setTimeout> | null;
  lastBroadcast: number;
}

const store: ControlStore = ((globalThis as Record<string, unknown> & { __mbControlStore?: ControlStore }).__mbControlStore ??= {
  announcement: null,
  flags: {},
  poll: null,
  roster: null,
  globalFilters: [],
  voters: new Map(),
  lockTimer: null,
  relayPull: null,
  listeners: new Set(),
  pendingBroadcast: null,
  lastBroadcast: 0,
});

export function getControlState(): ControlState {
  return {
    announcement: store.announcement,
    flags: { ...store.flags },
    poll: store.poll ? { ...store.poll, options: store.poll.options.map((o) => ({ ...o })) } : null,
    roster: store.roster,
    filters: store.globalFilters,
  };
}

export function subscribeControl(cb: (s: ControlState) => void): () => void {
  store.listeners.add(cb);
  return () => store.listeners.delete(cb);
}

function broadcast(immediate = false) {
  const send = () => {
    store.lastBroadcast = Date.now();
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
  entries: { name?: string; handles?: { twitch?: string; kick?: string; x?: string }; pinned?: boolean }[] | null,
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
    cleaned.push({ id, name, handles, platforms, live: false, viewers: 0, title: "", pinned: e.pinned === true });
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

/**
 * Clip radar — auto-detects clip-worthy moments from chat velocity, server-side.
 *
 * Off by default; the operator enables it under admin → Controls. While enabled it polls the
 * relay's message rate every 5 seconds and scores the current window against a rolling baseline
 * (level ratio + short-term acceleration, so a spike fires while it's still building). A firing
 * moment is persisted (SQLite when available, memory ring otherwise) with a snapshot of recent
 * chat lines, and — when a Twitch user token is configured — a real Twitch clip is cut via
 * Helix Create Clip. Twitch captures footage from BEFORE the request, so a moment detected
 * ~20-40s after the on-screen beat still lands inside the clip's edit window; the stored
 * edit_url lets the operator re-trim precisely for ~24h.
 *
 * Detection is deliberately eager (alert-level threshold) and curation is human: moments land
 * in admin → Analytics as a review strip with keep / dismiss. A junk clip costs nothing — a
 * missed moment is gone.
 */

import { randomBytes } from "node:crypto";

import { getDb } from "./db";

export interface ClipRadarConfig {
  /** Master switch — default off; nothing runs (or polls) until the operator enables it. */
  enabled: boolean;
  sensitivity: "low" | "medium" | "high";
  cooldownSec: number;
  /** Twitch login whose stream gets clipped on a moment ("" = record moments only). */
  clipChannel: string;
}

export interface ClipMomentContextLine {
  platform: string;
  author: string;
  text: string;
}

export interface ClipMoment {
  id: string;
  ts: number;
  score: number;
  kind: string;
  why: string;
  /** Combined chat rate at detection (messages/min) and its ratio over baseline. */
  mpm: number;
  ratio: number;
  channel: string | null;
  clipId: string | null;
  clipUrl: string | null;
  clipEditUrl: string | null;
  status: "new" | "kept" | "dismissed";
  context: ClipMomentContextLine[];
}

export interface ClipRadarStatus {
  enabled: boolean;
  relayConfigured: boolean;
  relayOk: boolean;
  /** Recent velocity samples [ts, messages/min] for the status sparkline. */
  samples: Array<[number, number]>;
  currentMpm: number;
  baselineMpm: number;
  lastScore: number;
  lastFireAt: number | null;
  clipTokenConfigured: boolean;
}

const TICK_MS = 5_000;
const IDLE_TICK_MS = 15_000;
const MAX_SAMPLES = 60; // 5 minutes of 5s samples
const WARMUP_SAMPLES = 8;
const MIN_ACTIVITY_MPM = 18; // below this chat is too quiet to score
const MIN_BASELINE_MPM = 6;
const MEMORY_MOMENTS_CAP = 100;
const THRESHOLDS: Record<ClipRadarConfig["sensitivity"], number> = { low: 75, medium: 60, high: 45 };

const DEFAULT_CONFIG: ClipRadarConfig = { enabled: false, sensitivity: "medium", cooldownSec: 120, clipChannel: "" };

interface RadarStore {
  started: boolean;
  config: ClipRadarConfig | null; // lazily hydrated from control_kv
  samples: Array<{ t: number; mps: number }>;
  relayOk: boolean;
  lastScore: number;
  lastFireAt: number | null;
  timer: ReturnType<typeof setTimeout> | null;
  memMoments: ClipMoment[];
  broadcasterIds: Map<string, string>;
}

const store: RadarStore = ((globalThis as Record<string, unknown> & { __mbClipRadar?: RadarStore }).__mbClipRadar ??= {
  started: false,
  config: null,
  samples: [],
  relayOk: false,
  lastScore: 0,
  lastFireAt: null,
  timer: null,
  memMoments: [],
  broadcasterIds: new Map(),
});

// ── Config (persisted in control_kv; in-memory when no database) ────────────────

export function getClipRadarConfig(): ClipRadarConfig {
  if (store.config) return store.config;
  const db = getDb();
  if (db) {
    try {
      const row = db.prepare("SELECT value FROM control_kv WHERE key = 'clip_radar_config'").get() as
        | { value: string }
        | undefined;
      if (row) {
        store.config = { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<ClipRadarConfig>) };
        return store.config;
      }
    } catch {
      /* fall through to defaults */
    }
  }
  store.config = { ...DEFAULT_CONFIG };
  return store.config;
}

export function setClipRadarConfig(patch: Partial<ClipRadarConfig>): ClipRadarConfig {
  const cur = getClipRadarConfig();
  const next: ClipRadarConfig = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : cur.enabled,
    sensitivity: patch.sensitivity && patch.sensitivity in THRESHOLDS ? patch.sensitivity : cur.sensitivity,
    cooldownSec: Math.min(900, Math.max(30, Math.round(Number(patch.cooldownSec ?? cur.cooldownSec)))),
    clipChannel: String(patch.clipChannel ?? cur.clipChannel)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 30),
  };
  store.config = next;
  const db = getDb();
  if (db) {
    try {
      db.prepare(
        "INSERT INTO control_kv (key, value) VALUES ('clip_radar_config', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(JSON.stringify(next));
    } catch (err) {
      console.error("[clip-radar] config persist failed", err);
    }
  }
  return next;
}

// ── Status ───────────────────────────────────────────────────────────────────────

function relayUrl(): string | null {
  const url = (process.env.RELAY_URL || "").replace(/\/$/, "");
  return url || null;
}

function clipTokenConfigured(): boolean {
  return Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIP_TOKEN);
}

export function getClipRadarStatus(): ClipRadarStatus {
  const cfg = getClipRadarConfig();
  const samples = store.samples.slice(-36).map(({ t, mps }) => [t, Math.round(mps * 60)] as [number, number]);
  return {
    enabled: cfg.enabled,
    relayConfigured: relayUrl() !== null,
    relayOk: store.relayOk,
    samples,
    currentMpm: currentMpm(),
    baselineMpm: baselineMpm(),
    lastScore: store.lastScore,
    lastFireAt: store.lastFireAt,
    clipTokenConfigured: clipTokenConfigured(),
  };
}

// ── Moments (SQLite first, memory ring fallback) ─────────────────────────────────

function rowToMoment(r: Record<string, unknown>): ClipMoment {
  let context: ClipMomentContextLine[] = [];
  try {
    context = r.context ? (JSON.parse(String(r.context)) as ClipMomentContextLine[]) : [];
  } catch {
    /* corrupt context — drop it */
  }
  return {
    id: String(r.id),
    ts: Number(r.ts),
    score: Number(r.score),
    kind: String(r.kind),
    why: String(r.why),
    mpm: Number(r.mpm),
    ratio: Number(r.ratio),
    channel: r.channel === null ? null : String(r.channel),
    clipId: r.clip_id === null ? null : String(r.clip_id),
    clipUrl: r.clip_url === null ? null : String(r.clip_url),
    clipEditUrl: r.clip_edit_url === null ? null : String(r.clip_edit_url),
    status: (r.status === "kept" || r.status === "dismissed" ? r.status : "new") as ClipMoment["status"],
    context,
  };
}

export function listClipMoments(limit = 30): ClipMoment[] {
  const db = getDb();
  if (db) {
    try {
      const rows = db
        .prepare("SELECT * FROM clip_moments ORDER BY ts DESC LIMIT ?")
        .all(Math.min(200, Math.max(1, limit))) as Array<Record<string, unknown>>;
      return rows.map(rowToMoment);
    } catch (err) {
      console.error("[clip-radar] list failed", err);
    }
  }
  return store.memMoments.slice(0, limit);
}

export function setClipMomentStatus(id: string, status: "kept" | "dismissed"): boolean {
  const db = getDb();
  if (db) {
    try {
      const res = db.prepare("UPDATE clip_moments SET status = ? WHERE id = ?").run(status, id);
      return Number(res.changes) > 0;
    } catch (err) {
      console.error("[clip-radar] status update failed", err);
    }
  }
  const m = store.memMoments.find((x) => x.id === id);
  if (m) m.status = status;
  return Boolean(m);
}

function saveMoment(m: ClipMoment) {
  const db = getDb();
  if (db) {
    try {
      db.prepare(
        `INSERT INTO clip_moments (id, ts, score, kind, why, mpm, ratio, channel, clip_id, clip_url, clip_edit_url, status, context)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(m.id, m.ts, m.score, m.kind, m.why, m.mpm, m.ratio, m.channel, m.clipId, m.clipUrl, m.clipEditUrl, m.status, JSON.stringify(m.context));
      return;
    } catch (err) {
      console.error("[clip-radar] persist failed; keeping in memory", err);
    }
  }
  store.memMoments.unshift(m);
  if (store.memMoments.length > MEMORY_MOMENTS_CAP) store.memMoments.length = MEMORY_MOMENTS_CAP;
}

// ── Twitch clip creation (optional — needs a user token with clips:edit) ─────────

async function resolveBroadcasterId(login: string): Promise<string | null> {
  const cached = store.broadcasterIds.get(login);
  if (cached) return cached;
  try {
    const res = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
      headers: { "Client-Id": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${process.env.TWITCH_CLIP_TOKEN}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ id: string }> };
    const id = data.data?.[0]?.id ?? null;
    if (id) store.broadcasterIds.set(login, id);
    return id;
  } catch {
    return null;
  }
}

async function createTwitchClip(login: string): Promise<{ id: string; url: string; editUrl: string } | null> {
  if (!clipTokenConfigured() || !login) return null;
  const broadcasterId = await resolveBroadcasterId(login);
  if (!broadcasterId) return null;
  try {
    const res = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
      method: "POST",
      headers: { "Client-Id": process.env.TWITCH_CLIENT_ID!, Authorization: `Bearer ${process.env.TWITCH_CLIP_TOKEN}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[clip-radar] twitch clip failed for ${login}: ${res.status} ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = (await res.json()) as { data?: Array<{ id: string; edit_url: string }> };
    const clip = data.data?.[0];
    return clip ? { id: clip.id, url: `https://clips.twitch.tv/${clip.id}`, editUrl: clip.edit_url } : null;
  } catch (err) {
    console.warn("[clip-radar] twitch clip error", err);
    return null;
  }
}

// ── Chat context: read the relay /feed replay burst, then hang up ─────────────────

async function captureRelayContext(maxLines = 15): Promise<ClipMomentContextLine[]> {
  const relay = relayUrl();
  if (!relay) return [];
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 700);
  try {
    const res = await fetch(`${relay}/feed`, { signal: ac.signal });
    if (!res.ok || !res.body) return [];
    const reader = res.body.getReader();
    let buf = "";
    // The relay replays its recent ring buffer immediately on connect — one or two reads is
    // enough. The stream stays open, so the timeout abort is the normal exit; keep what we have.
    try {
      for (let i = 0; i < 4; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += new TextDecoder().decode(value);
        if (buf.length > 64_000) break;
      }
    } catch {
      /* aborted mid-read — parse whatever arrived */
    }
    ac.abort();

    const lines: ClipMomentContextLine[] = [];
    const frames = buf.split("\n\n");
    for (const frame of frames) {
      if (!frame.includes("event: message")) continue;
      const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      try {
        const msg = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
        const text = String(msg.text ?? msg.message ?? msg.body ?? "").slice(0, 200);
        if (!text) continue;
        lines.push({
          platform: String(msg.platform ?? msg.source ?? "?"),
          author: String(msg.author ?? msg.username ?? msg.user ?? msg.name ?? "?").slice(0, 40),
          text,
        });
      } catch {
        /* skip malformed frame */
      }
    }
    return lines.slice(-maxLines);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ── Detection ─────────────────────────────────────────────────────────────────────

function currentMpm(): number {
  const last = store.samples.slice(-3);
  if (!last.length) return 0;
  return Math.round((last.reduce((n, s) => n + s.mps, 0) / last.length) * 60);
}

function baselineMpm(): number {
  const past = store.samples.slice(0, -6);
  if (past.length < 4) return 0;
  const sorted = past.map((s) => s.mps * 60).sort((a, b) => a - b);
  return Math.round(sorted[Math.floor(sorted.length / 2)]);
}

async function tick() {
  const cfg = getClipRadarConfig();
  if (!cfg.enabled) {
    store.timer = setTimeout(() => void tick(), IDLE_TICK_MS);
    return;
  }

  const relay = relayUrl();
  if (relay) {
    try {
      const res = await fetch(`${relay}/health`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        const { mps } = (await res.json()) as { mps?: number };
        store.relayOk = true;
        store.samples.push({ t: Date.now(), mps: Number(mps) || 0 });
        if (store.samples.length > MAX_SAMPLES) store.samples = store.samples.slice(-MAX_SAMPLES);
        evaluate(cfg);
      } else {
        store.relayOk = false;
      }
    } catch {
      store.relayOk = false;
    }
  } else {
    store.relayOk = false;
  }

  store.timer = setTimeout(() => void tick(), TICK_MS);
}

function evaluate(cfg: ClipRadarConfig) {
  if (store.samples.length < WARMUP_SAMPLES) return;
  const now = Date.now();
  const cur = currentMpm();
  const base = baselineMpm();
  // No established baseline yet (or chat too quiet) — don't score against thin air.
  if (base <= 0 || cur < MIN_ACTIVITY_MPM) {
    store.lastScore = 0;
    return;
  }

  const ratio = cur / Math.max(base, MIN_BASELINE_MPM);
  // Acceleration: how much the rate climbed over the last ~15s, relative to baseline. This is
  // what lets the radar fire while a spike is still building instead of after it plateaus.
  const ago = store.samples[Math.max(0, store.samples.length - 4)];
  const rise = cur - ago.mps * 60;
  const accelBoost = Math.max(0, Math.min(30, (rise / Math.max(base, MIN_BASELINE_MPM)) * 30));
  const velScore = Math.max(0, Math.min(70, (ratio - 1.25) * 50));
  const score = Math.round(Math.min(100, velScore + accelBoost));
  store.lastScore = score;

  if (score < THRESHOLDS[cfg.sensitivity]) return;
  if (store.lastFireAt && now - store.lastFireAt < cfg.cooldownSec * 1000) return;
  store.lastFireAt = now;

  const why = [
    `${ratio.toFixed(1)}× baseline`,
    `${cur} msg/min`,
    rise > base * 0.4 ? "still climbing" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Fire-and-forget: context + clip happen async so the tick loop never blocks on them.
  void (async () => {
    const [context, clip] = await Promise.all([
      captureRelayContext(),
      createTwitchClip(cfg.clipChannel),
    ]);
    const moment: ClipMoment = {
      id: `cm_${randomBytes(5).toString("base64url")}`,
      ts: now,
      score,
      kind: rise > base * 0.4 ? "SURGE" : "SPIKE",
      why,
      mpm: cur,
      ratio: Math.round(ratio * 10) / 10,
      channel: cfg.clipChannel || null,
      clipId: clip?.id ?? null,
      clipUrl: clip?.url ?? null,
      clipEditUrl: clip?.editUrl ?? null,
      status: "new",
      context,
    };
    saveMoment(moment);
    console.log(`[clip-radar] moment ${moment.id}: ${score} (${why})${clip ? ` clip ${clip.id}` : ""}`);
  })();
}

/** Start the radar loop (idempotent; call once from instrumentation). */
export function startClipRadar() {
  if (store.started) return;
  store.started = true;
  store.timer = setTimeout(() => void tick(), TICK_MS);
  console.log("[clip-radar] armed (enable it under admin → Controls)");
}

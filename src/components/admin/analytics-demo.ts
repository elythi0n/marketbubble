"use client";

import type { AdminStatsPayload } from "@/app/api/admin/stats/route";
import type { AdminHeatmapPayload } from "@/app/api/admin/stats/heatmap/route";
import type { AdminSessionsPayload, StreamSession } from "@/app/api/admin/stats/sessions/route";

/**
 * Demo data for /admin/analytics?demo=1 — a fake `call` that answers the three stats endpoints
 * with a synthesized show, so the page (and all its drill-downs) can be demoed without a
 * database. Everything derives deterministically from a per-day PRNG over a fixed "schedule",
 * so sessions, the heatmap, and the series all roughly agree with each other.
 */

const DAY_MS = 86_400_000;

interface DemoStreamer {
  id: string;
  platform: string;
  base: number;
  /** Local hour the daily slot starts, and its rough length. */
  startH: number;
  hours: number;
}

const ROSTER: DemoStreamer[] = [
  { id: "banks", platform: "twitch", base: 3200, startH: 18, hours: 5 },
  { id: "blknoiz06", platform: "kick", base: 5400, startH: 20, hours: 4 },
  { id: "marketbubble", platform: "x", base: 1100, startH: 14, hours: 3 },
];

function mulberry(seedStr: string): () => number {
  let seed = 0;
  for (const c of seedStr) seed = (seed * 31 + c.charCodeAt(0)) | 0;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** All demo sessions overlapping [from, to], deterministic per streamer × local day. */
function demoSessions(from: number, to: number): StreamSession[] {
  const now = Date.now();
  const tzMs = new Date().getTimezoneOffset() * 60_000;
  const out: StreamSession[] = [];

  for (const s of ROSTER) {
    const firstDay = Math.floor((from - tzMs) / DAY_MS) - 1;
    const lastDay = Math.floor((to - tzMs) / DAY_MS);
    for (let day = firstDay; day <= lastDay; day++) {
      const rnd = mulberry(`${s.id}:${day}`);
      if (rnd() < 0.22) continue; // day off
      const start = day * DAY_MS + tzMs + (s.startH + rnd() * 1.5) * 3600_000;
      const plannedEnd = start + s.hours * (0.7 + rnd() * 0.6) * 3600_000;
      const ongoing = start <= now && plannedEnd > now;
      const end = Math.min(plannedEnd, now);
      if (start >= now || end <= from || start >= to) continue;
      const peak = Math.round(s.base * (0.75 + rnd() * 0.6));
      out.push({
        streamerId: s.id,
        platform: s.platform,
        start: Math.round(start),
        end: Math.round(end),
        ongoing,
        peak,
        avg: Math.round(peak * (0.6 + rnd() * 0.15)),
      });
    }
  }
  return out.sort((a, b) => b.start - a.start);
}

/** Viewer count for one session at time ts — a sine arc from ~avg up to peak and back. */
function sessionValue(s: StreamSession, ts: number): number {
  const p = (ts - s.start) / Math.max(1, s.end - s.start);
  const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, p)));
  const wobble = Math.sin(ts / 600_000) * 0.06 + Math.sin(ts / 150_000) * 0.03;
  return Math.max(0, Math.round(s.avg + (s.peak - s.avg) * arc + s.peak * wobble));
}

function statsPayload(from: number, to: number): AdminStatsPayload {
  const bucketMs = Math.max(60_000, Math.round((to - from) / 240 / 60_000) * 60_000);
  const sessions = demoSessions(from, to);
  const series: AdminStatsPayload["series"] = {};

  for (let ts = Math.ceil(from / bucketMs) * bucketMs; ts <= to; ts += bucketMs) {
    let clients = 0;
    for (const s of sessions) {
      if (ts < s.start || ts > s.end) continue;
      const metric = `viewers:${s.platform}:${s.streamerId}`;
      const v = sessionValue(s, ts);
      (series[metric] ??= []).push([ts, v]);
      clients += v;
    }
    if (clients > 0) (series["relay:clients"] ??= []).push([ts, Math.round(clients * 0.12)]);
  }
  return { from, to, bucketMs, series };
}

function heatmapPayload(days: number, tz: number): AdminHeatmapPayload {
  const now = Date.now();
  const from = now - days * DAY_MS;
  const sessions = demoSessions(from, now);

  const byDay = new Map<number, number>();
  for (const s of sessions) {
    // Sample the session coarsely and credit each local day with the combined peak.
    for (let ts = s.start; ts <= s.end; ts += 15 * 60_000) {
      const day = Math.floor((ts - tz * 60_000) / DAY_MS);
      const concurrent = sessions
        .filter((o) => ts >= o.start && ts <= o.end)
        .reduce((n, o) => n + sessionValue(o, ts), 0);
      byDay.set(day, Math.max(byDay.get(day) ?? 0, concurrent));
    }
  }
  return {
    tz,
    days: [...byDay.entries()].map(([day, peak]) => ({ day, peak })).sort((a, b) => a.day - b.day),
  };
}

/** Drop-in replacement for the admin `call` covering the analytics endpoints. */
export function createAnalyticsDemoCall(): (path: string, init?: RequestInit) => Promise<Response> {
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  return async (path: string) => {
    const url = new URL(path, window.location.origin);
    const now = Date.now();
    const to = Math.min(Number(url.searchParams.get("to")) || now, now);
    const from = Number(url.searchParams.get("from")) || to - 24 * 3600_000;

    if (url.pathname === "/api/admin/stats/sessions") {
      return json({ from, to, sessions: demoSessions(from, to) } satisfies AdminSessionsPayload);
    }
    if (url.pathname === "/api/admin/stats/heatmap") {
      const days = Number(url.searchParams.get("days")) || 91;
      const tz = Number(url.searchParams.get("tz")) || 0;
      return json(heatmapPayload(days, tz));
    }
    if (url.pathname === "/api/admin/stats") {
      return json(statsPayload(from, to));
    }
    if (url.pathname === "/api/admin/clip-radar/moments") {
      return json({ moments: demoMoments(now) });
    }
    return new Response(null, { status: 404 });
  };
}

/** A handful of plausible radar moments for the demo review strip. */
function demoMoments(now: number) {
  const mk = (agoMin: number, score: number, kind: string, why: string, status: string, clip: boolean) => ({
    id: `demo_${agoMin}`,
    ts: now - agoMin * 60_000,
    score,
    kind,
    why,
    mpm: 240,
    ratio: 2.1,
    channel: clip ? "fazebanks" : null,
    clipId: clip ? "DemoClip" : null,
    clipUrl: clip ? "https://clips.twitch.tv/" : null,
    clipEditUrl: null,
    status,
    context: [],
  });
  return [
    mk(4, 82, "SURGE", "2.6× baseline · 312 msg/min · still climbing", "new", true),
    mk(31, 64, "SPIKE", "1.9× baseline · 221 msg/min", "new", true),
    mk(58, 71, "SURGE", "2.2× baseline · 247 msg/min · still climbing", "kept", true),
    mk(95, 55, "SPIKE", "1.7× baseline · 188 msg/min", "dismissed", false),
  ];
}

/** Static leaderboard for the demo Top chatters card. */
export const DEMO_TOP_CHATTERS = [
  { name: "diamondhandz", platform: "kick", count: 4821 },
  { name: "exit_liquidity", platform: "twitch", count: 4102 },
  { name: "wickhunter", platform: "twitch", count: 3377 },
  { name: "bagholder99", platform: "x", count: 2980 },
  { name: "candle_wizard", platform: "kick", count: 2455 },
  { name: "fomo_frank", platform: "twitch", count: 2106 },
  { name: "moon_mission", platform: "kick", count: 1762 },
  { name: "tape_reader", platform: "x", count: 1404 },
  { name: "perma_bull", platform: "twitch", count: 1199 },
  { name: "satoshi_lite", platform: "kick", count: 951 },
];

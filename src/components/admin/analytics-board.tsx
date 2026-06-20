"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ExternalLink, History, LineChart, MessagesSquare, Pencil, Scissors, Share2, Trophy, X } from "lucide-react";

import type { ClipMomentsPayload } from "@/app/api/admin/clip-radar/moments/route";
import type { ClipMoment } from "@/lib/server/clip-radar";
import type { AdminStatsPayload } from "@/app/api/admin/stats/route";
import type { AdminHeatmapPayload } from "@/app/api/admin/stats/heatmap/route";
import type { AdminSessionsPayload, StreamSession } from "@/app/api/admin/stats/sessions/route";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";
import { AnalyticsPanel, type ChartPin } from "./analytics-panel";
import { DEMO_TOP_CHATTERS } from "./analytics-demo";
import { Card } from "./card";
import { ShareDialog, type ShareCard } from "./share-dialog";

const DAY_MS = 86_400_000;
const HEATMAP_WEEKS = 13; // matches the sampler's 90-day retention
/** GitHub-green ramp; index 0 is "no data / zero". */
const HEAT_COLORS = ["rgba(255,255,255,0.045)", "#10381a", "#1a5c2a", "#2c8c40", "#46c45a"];

function localDayIndex(ts: number, tz: number): number {
  return Math.floor((ts - tz * 60_000) / DAY_MS);
}

function dayIndexToDate(day: number, tz: number): Date {
  // Noon of the local day — safely inside it regardless of DST shifts.
  return new Date(day * DAY_MS + tz * 60_000 + DAY_MS / 2);
}

function formatViewers(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(Math.round(n));
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

function formatDayShort(d: Date): string {
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function formatSessionTime(ts: number): string {
  return new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * GitHub-style calendar: columns are weeks (Mon-start), rows Mon→Sun, color = that day's
 * peak combined viewer count. Clicking a day pins the time-series chart to it.
 */
function Heatmap({
  data,
  onPickDay,
}: {
  data: AdminHeatmapPayload | null;
  onPickDay: (dayStartMs: number) => void;
}) {
  const tz = data?.tz ?? new Date().getTimezoneOffset();
  const byDay = useMemo(() => new Map((data?.days ?? []).map((d) => [d.day, d.peak])), [data]);
  const today = localDayIndex(Date.now(), tz);
  // Epoch day 0 was a Thursday; shift so columns start on Monday.
  const weekday = (day: number) => (((day + 3) % 7) + 7) % 7;
  const gridStart = today - weekday(today) - (HEATMAP_WEEKS - 1) * 7;
  const max = Math.max(1, ...(data?.days ?? []).filter((d) => d.day >= gridStart).map((d) => d.peak));

  const level = (peak: number | undefined) => {
    if (!peak) return 0;
    return Math.min(4, 1 + Math.floor((peak / max) * 4 - 1e-9));
  };

  const monthLabels: Array<{ week: number; label: string }> = [];
  for (let w = 0; w < HEATMAP_WEEKS; w++) {
    const date = dayIndexToDate(gridStart + w * 7, tz);
    const prev = w > 0 ? dayIndexToDate(gridStart + (w - 1) * 7, tz) : null;
    if (!prev || date.getMonth() !== prev.getMonth()) {
      monthLabels.push({ week: w, label: date.toLocaleDateString([], { month: "short" }) });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {/* Month labels — one slot per week column, labelled where the month flips. */}
          <div className="ml-8 grid auto-cols-[14px] grid-flow-col gap-[3px] text-[0.6rem] text-muted-foreground">
            {Array.from({ length: HEATMAP_WEEKS }, (_, w) => (
              <span key={w} className="overflow-visible whitespace-nowrap">
                {monthLabels.find((m) => m.week === w)?.label ?? ""}
              </span>
            ))}
          </div>
          <div className="flex gap-1">
            <div className="grid w-7 grid-rows-7 gap-[3px] text-right text-[0.6rem] leading-[11px] text-muted-foreground">
              {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
              {Array.from({ length: HEATMAP_WEEKS * 7 }, (_, i) => {
                // grid-flow-col fills rows first, so i maps column-major: week = i/7, weekday = i%7.
                const day = gridStart + Math.floor(i / 7) * 7 + (i % 7);
                if (day > today) return <span key={day} className="size-[11px]" />;
                const peak = byDay.get(day);
                const date = dayIndexToDate(day, tz);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onPickDay(day * DAY_MS + tz * 60_000)}
                    title={`${formatDayShort(date)} — ${peak ? `peak ${formatViewers(peak)} viewers` : "no viewers recorded"}`}
                    aria-label={`${formatDayShort(date)}, peak ${peak ?? 0} viewers`}
                    className="size-[11px] rounded-[3px] transition-transform hover:scale-125"
                    style={{ backgroundColor: HEAT_COLORS[level(peak)] }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[0.62rem] text-muted-foreground">
        <span>Less</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} className="size-[10px] rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        <span>More</span>
        <span className="ml-auto">peak combined viewers · click a day to inspect it in the chart</span>
      </div>
    </div>
  );
}

const SESSION_RANGES = [
  { label: "7d", ms: 7 * DAY_MS },
  { label: "30d", ms: 30 * DAY_MS },
  { label: "90d", ms: 90 * DAY_MS },
];

/** Aggregates of the session list — the "how did the period go" row. */
function SummaryTiles({ sessions, heatmap, rangeLabel }: { sessions: StreamSession[]; heatmap: AdminHeatmapPayload | null; rangeLabel: string }) {
  const now = Date.now();
  const liveMs = sessions.reduce((n, s) => n + ((s.ongoing ? now : s.end) - s.start), 0);
  const peak = sessions.reduce((n, s) => Math.max(n, s.peak), 0);
  const busiest = (heatmap?.days ?? []).reduce<{ day: number; peak: number } | null>(
    (best, d) => (best === null || d.peak > best.peak ? d : best),
    null,
  );
  const tz = heatmap?.tz ?? new Date().getTimezoneOffset();

  const tiles = [
    { label: `Hours live · ${rangeLabel}`, value: (liveMs / 3600_000).toFixed(1) },
    { label: `Sessions · ${rangeLabel}`, value: String(sessions.length) },
    { label: `Peak viewers · ${rangeLabel}`, value: formatViewers(peak) },
    {
      label: "Busiest day · 13w",
      value: busiest ? formatDayShort(dayIndexToDate(busiest.day, tz)) : "—",
      sub: busiest ? `${formatViewers(busiest.peak)} peak` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-hairline bg-sidebar/85 px-4 py-3">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t.label}</p>
          <p className="mt-1 font-mono text-[1.3rem] font-bold tabular-nums leading-none text-foreground">{t.value}</p>
          {t.sub ? <p className="mt-1 text-[0.66rem] text-muted-foreground">{t.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

/** Per-channel rollup of the session list: who streamed how much and how it drew. */
function StreamerTotals({ sessions, streamers }: { sessions: StreamSession[]; streamers: Streamer[] }) {
  const now = Date.now();
  const rows = useMemo(() => {
    const byKey = new Map<string, { streamerId: string; platform: string; n: number; ms: number; peak: number }>();
    for (const s of sessions) {
      const key = `${s.platform}:${s.streamerId}`;
      const cur = byKey.get(key) ?? { streamerId: s.streamerId, platform: s.platform, n: 0, ms: 0, peak: 0 };
      cur.n += 1;
      cur.ms += (s.ongoing ? now : s.end) - s.start;
      cur.peak = Math.max(cur.peak, s.peak);
      byKey.set(key, cur);
    }
    return [...byKey.values()].sort((a, b) => b.ms - a.ms);
  }, [sessions, now]);

  if (rows.length === 0) return <p className="text-[0.78rem] text-muted-foreground">No sessions in this window yet.</p>;

  const nameOf = (id: string) => streamers.find((s) => s.id === id)?.name ?? id;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={`${r.platform}:${r.streamerId}`} className="flex items-center gap-2.5">
          <PlatformGlyph platform={r.platform as Streamer["platforms"][number]} className="size-3 flex-none" />
          <span className="min-w-0 flex-1 truncate text-[0.8rem] font-medium text-foreground">{nameOf(r.streamerId)}</span>
          <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">{r.n}×</span>
          <span className="w-16 text-right font-mono text-[0.7rem] tabular-nums text-foreground/85">{formatDuration(r.ms)}</span>
          <span className="w-16 text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground">↑ {formatViewers(r.peak)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Review strip for radar-detected moments: keep, open/edit the Twitch clip, or dismiss. */
function ClipMomentsCard({ call, demo }: { call: (path: string, init?: RequestInit) => Promise<Response>; demo: boolean }) {
  const [moments, setMoments] = useState<ClipMoment[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await call("/api/admin/clip-radar/moments?limit=20");
      if (res.ok) setMoments(((await res.json()) as ClipMomentsPayload).moments);
    } catch {
      /* keep previous */
    }
  }, [call]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  const review = async (id: string, status: "kept" | "dismissed") => {
    setMoments((cur) => (cur ? cur.map((m) => (m.id === id ? { ...m, status } : m)) : cur));
    if (!demo) await call("/api/admin/clip-radar/moments", { method: "POST", body: JSON.stringify({ id, status }) });
  };

  const scoreTone = (score: number) =>
    score >= 75 ? "border-feed-ok/30 bg-feed-ok/[0.1] text-feed-ok" : "border-feed-warn/30 bg-feed-warn/[0.1] text-feed-warn";

  return (
    <Card
      title="Clip radar moments"
      hint="Auto-detected chat spikes — review, open the clip, or dismiss"
      icon={Scissors}
      className="lg:col-span-2"
    >
      {moments === null ? (
        <p className="text-[0.78rem] text-muted-foreground">Loading…</p>
      ) : moments.length === 0 ? (
        <p className="text-[0.78rem] text-muted-foreground">
          No moments yet — arm the radar under Controls and they collect here while chat is busy.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {moments.map((m) => (
            <li
              key={m.id}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-opacity",
                m.status === "dismissed" && "opacity-40",
              )}
            >
              <span className={cn("flex-none rounded-md border px-1.5 py-0.5 font-mono text-[0.66rem] font-bold tabular-nums", scoreTone(m.score))}>
                {m.score}
              </span>
              <span className="w-24 flex-none font-mono text-[0.7rem] tabular-nums text-muted-foreground">
                {new Date(m.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.78rem] text-foreground/90">
                <span className="font-semibold text-foreground">{m.kind}</span>
                <span className="text-muted-foreground"> · {m.why}</span>
              </span>
              {m.clipUrl ? (
                <a href={m.clipUrl} target="_blank" rel="noreferrer" title="Watch the Twitch clip" className="inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground">
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {m.clipEditUrl ? (
                <a href={m.clipEditUrl} target="_blank" rel="noreferrer" title="Re-trim on Twitch (24h window)" className="inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground">
                  <Pencil className="size-3.5" />
                </a>
              ) : null}
              {m.status === "new" ? (
                <span className="flex flex-none items-center">
                  <button type="button" onClick={() => void review(m.id, "kept")} title="Keep" className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-feed-ok">
                    <Check className="size-3.5" />
                  </button>
                  <button type="button" onClick={() => void review(m.id, "dismissed")} title="Dismiss" className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-feed-danger">
                    <X className="size-3.5" />
                  </button>
                </span>
              ) : (
                <span className="w-14 flex-none text-right text-[0.64rem] font-semibold uppercase tracking-wide text-muted-foreground">
                  {m.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface TopChattersPayload {
  source: string | null;
  chatters: Array<{ name: string; platform: string; count: number }>;
}

/** The most active chatters across all connected channels (durable, offline chat included). */
function TopChatters({ demo }: { demo: boolean }) {
  const [data, setData] = useState<TopChattersPayload | null>(null);
  useEffect(() => {
    if (demo) {
      setData({ source: "demo", chatters: DEMO_TOP_CHATTERS });
      return;
    }
    fetch("/api/leaderboard/chatters", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: TopChattersPayload) => setData(d))
      .catch(() => {});
  }, [demo]);

  if (!data || data.chatters.length === 0) {
    return <p className="text-[0.78rem] text-muted-foreground">No chatters recorded yet.</p>;
  }
  const max = data.chatters[0]?.count ?? 1;
  return (
    <ul className="flex flex-col gap-1.5">
      {data.chatters.slice(0, 10).map((c, i) => (
        <li key={`${c.platform}:${c.name}`} className="relative overflow-hidden rounded-md px-2 py-1">
          <span className="absolute inset-y-0 left-0 bg-overlay-weak" style={{ width: `${(c.count / max) * 100}%` }} aria-hidden />
          <span className="relative flex items-center gap-2">
            <span className="w-5 font-mono text-[0.66rem] tabular-nums text-muted-foreground">{i + 1}</span>
            <PlatformGlyph platform={c.platform as Streamer["platforms"][number]} className="size-3 flex-none" />
            <span className="min-w-0 flex-1 truncate text-[0.78rem] font-medium text-foreground">{c.name}</span>
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">{c.count.toLocaleString()}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function SessionsTable({
  sessions,
  streamers,
  onPick,
  onShare,
}: {
  sessions: StreamSession[];
  streamers: Streamer[];
  onPick: (s: StreamSession) => void;
  onShare: (s: StreamSession) => void;
}) {
  const nameOf = (id: string) => streamers.find((s) => s.id === id)?.name ?? id;

  return (
    <ul className="flex flex-col">
      {sessions.map((s) => (
        <li key={`${s.platform}:${s.streamerId}:${s.start}`} className="group flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPick(s)}
            title="Show this session in the chart"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-overlay-weak"
          >
            <PlatformGlyph platform={s.platform as Streamer["platforms"][number]} className="size-3 flex-none" />
            <span className="w-28 truncate text-[0.8rem] font-medium text-foreground">{nameOf(s.streamerId)}</span>
            <span className="min-w-0 flex-1 truncate font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              {formatSessionTime(s.start)} → {s.ongoing ? "now" : formatSessionTime(s.end)}
            </span>
            {s.ongoing ? (
              <span className="flex-none rounded-md border border-feed-ok/25 bg-feed-ok/[0.08] px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-feed-ok">
                live
              </span>
            ) : null}
            <span className="w-16 text-right font-mono text-[0.7rem] tabular-nums text-foreground/85">
              {formatDuration((s.ongoing ? Date.now() : s.end) - s.start)}
            </span>
            <span className="w-20 text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground">
              ↑ {formatViewers(s.peak)}
            </span>
            <span className="hidden w-20 text-right font-mono text-[0.7rem] tabular-nums text-muted-foreground sm:inline">
              ø {formatViewers(s.avg)}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onShare(s)}
            title="Share this show (all channels in this time block, combined)"
            aria-label={`Share the show around ${nameOf(s.streamerId)}'s session`}
            className="inline-flex size-7 flex-none items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[color,opacity] focus-visible:opacity-100 group-hover:opacity-100 hover:bg-overlay-weak hover:text-foreground"
          >
            <Share2 className="size-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The admin Analytics tab: viewer time-series, GitHub-style daily heatmap, and the stream
 * session log — all reconstructed from the sampler's stat_samples table.
 */
export function AnalyticsBoard({
  call,
  enabled,
  streamers,
  demo = false,
}: {
  call: (path: string) => Promise<Response>;
  enabled: boolean;
  streamers: Streamer[];
  /** Demo mode: `call` is the synthetic stats generator; the chatters card uses canned data. */
  demo?: boolean;
}) {
  const [pin, setPin] = useState<ChartPin | null>(null);
  const [heatmap, setHeatmap] = useState<AdminHeatmapPayload | null>(null);
  const [sessionRange, setSessionRange] = useState(7 * DAY_MS);
  const [sessions, setSessions] = useState<StreamSession[] | null>(null);
  /** Local-day start (ms) of the last heatmap day clicked — the default subject for sharing. */
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [share, setShare] = useState<ShareCard | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const tz = new Date().getTimezoneOffset();
    call(`/api/admin/stats/heatmap?days=${HEATMAP_WEEKS * 7}&tz=${tz}`)
      .then(async (res) => {
        if (res.ok) setHeatmap((await res.json()) as AdminHeatmapPayload);
      })
      .catch(() => {});
  }, [call, enabled]);

  const loadSessions = useCallback(() => {
    if (!enabled) return;
    call(`/api/admin/stats/sessions?from=${Date.now() - sessionRange}`)
      .then(async (res) => {
        if (res.ok) setSessions(((await res.json()) as AdminSessionsPayload).sessions);
      })
      .catch(() => {});
  }, [call, enabled, sessionRange]);

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 120_000);
    return () => clearInterval(id);
  }, [loadSessions]);

  if (!enabled) {
    return (
      <Card title="Analytics" hint="Viewer history, sessions, and activity heatmap" icon={LineChart}>
        <p className="text-[0.78rem] text-muted-foreground">
          Requires the database — set{" "}
          <code className="rounded bg-overlay-weak px-1 py-0.5 text-[0.7rem]">DATABASE_PATH</code> to record viewer
          history and chat stats across restarts.
        </p>
      </Card>
    );
  }

  const rangeLabel = SESSION_RANGES.find((r) => r.ms === sessionRange)?.label ?? "";

  /** Build the share card for the selected heatmap day (or the busiest one when none is picked). */
  const openDayShare = () => {
    const tz = heatmap?.tz ?? new Date().getTimezoneOffset();
    let dayStart = selectedDay;
    if (dayStart === null) {
      const busiest = (heatmap?.days ?? []).reduce<{ day: number; peak: number } | null>(
        (best, d) => (best === null || d.peak > best.peak ? d : best),
        null,
      );
      if (!busiest) return;
      dayStart = busiest.day * DAY_MS + tz * 60_000;
    }
    const dayEnd = dayStart + DAY_MS;
    const now = Date.now();
    const peak = heatmap?.days.find((d) => d.day === localDayIndex(dayStart!, tz))?.peak ?? 0;

    // Session-derived extras only when the loaded window actually covers that day.
    const covered = sessions !== null && now - sessionRange <= dayStart;
    const overlapping = (sessions ?? []).filter((s) => s.start < dayEnd && (s.ongoing ? now : s.end) > dayStart!);
    // "Hours live" is wall-clock — the UNION of session intervals (clipped to the day), so
    // simulcasting on Twitch + Kick + X doesn't multiply the duration. Merge overlapping intervals.
    const intervals = overlapping
      .map((s) => [Math.max(s.start, dayStart!), Math.min(s.ongoing ? now : s.end, dayEnd)] as [number, number])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let liveMs = 0;
    let curStart = -1;
    let curEnd = -1;
    for (const [a, b] of intervals) {
      if (a > curEnd) {
        if (curEnd > curStart) liveMs += curEnd - curStart;
        curStart = a;
        curEnd = b;
      } else if (b > curEnd) {
        curEnd = b;
      }
    }
    if (curEnd > curStart) liveMs += curEnd - curStart;

    setShare({
      kind: "day",
      dateLabel: dayIndexToDate(localDayIndex(dayStart, tz), tz).toLocaleDateString([], {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
      peak,
      hours: covered ? liveMs / 3600_000 : undefined,
      sessions: covered ? overlapping.length : undefined,
    });
  };

  /**
   * Share the unified show: take the clicked session, pull in every session that overlaps or
   * chains with it (≤30 min apart, any channel), and present the block as one "MarketBubble"
   * stream — combined viewer curve, combined peak.
   */
  const openSessionShare = async (s: StreamSession) => {
    const GAP = 30 * 60_000;
    const now = Date.now();
    const endOf = (x: StreamSession) => (x.ongoing ? now : x.end);

    const members = new Set<StreamSession>([s]);
    let start = s.start;
    let end = endOf(s);
    for (let grew = true; grew; ) {
      grew = false;
      for (const o of sessions ?? []) {
        if (members.has(o) || o.start > end + GAP || endOf(o) < start - GAP) continue;
        members.add(o);
        start = Math.min(start, o.start);
        end = Math.max(end, endOf(o));
        grew = true;
      }
    }

    // Combined concurrent viewers: sum every channel's series per bucket (buckets share a grid).
    let points: Array<[number, number]> = [];
    try {
      const res = await call(`/api/admin/stats?from=${start}&to=${end}`);
      if (res.ok) {
        const data = (await res.json()) as AdminStatsPayload;
        const sums = new Map<number, number>();
        for (const [metric, pts] of Object.entries(data.series)) {
          if (!metric.startsWith("viewers:")) continue;
          for (const [ts, v] of pts) sums.set(ts, (sums.get(ts) ?? 0) + v);
        }
        points = [...sums.entries()].sort((a, b) => a[0] - b[0]);
      }
    } catch {
      /* card still works without the curve */
    }
    const live = points.filter(([, v]) => v > 0);
    const peak = live.length ? Math.max(...live.map(([, v]) => v)) : Math.max(...[...members].map((m) => m.peak));
    const avg = live.length
      ? Math.round(live.reduce((n, [, v]) => n + v, 0) / live.length)
      : Math.round([...members].reduce((n, m) => n + m.avg, 0) / members.size);

    const ongoing = [...members].some((m) => m.ongoing);
    const platforms = [...new Set([...members].map((m) => m.platform))].join(" · ");
    const clock = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    setShare({
      kind: "session",
      streamer: "MarketBubble",
      platform: platforms,
      dateLabel: new Date(start).toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" }),
      startLabel: clock(start),
      endLabel: ongoing ? "now" : clock(end),
      durationLabel: formatDuration(end - start),
      peak,
      avg,
      points,
    });
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <SummaryTiles sessions={sessions ?? []} heatmap={heatmap} rangeLabel={rangeLabel} />

      <Card
        title="Viewer history"
        hint="Per-channel viewers and chat load, sampled every minute while live"
        icon={LineChart}
        className="lg:col-span-2"
      >
        <AnalyticsPanel call={call} enabled={enabled} pin={pin} />
      </Card>

      <Card
        title="Activity heatmap"
        hint={`Daily peak combined viewers, last ${HEATMAP_WEEKS} weeks`}
        icon={CalendarDays}
        className="lg:col-span-2"
        status={
          <button
            type="button"
            onClick={openDayShare}
            disabled={!heatmap?.days.length}
            title={selectedDay === null ? "Share the busiest day" : "Share the selected day"}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-hairline-strong bg-overlay-weak px-2.5 text-[0.7rem] font-medium text-foreground transition-colors hover:bg-overlay-medium disabled:opacity-35"
          >
            <Share2 className="size-3" />
            Share
          </button>
        }
      >
        <Heatmap
          data={heatmap}
          onPickDay={(dayStart) => {
            setSelectedDay(dayStart);
            setPin({ end: Math.min(dayStart + DAY_MS, Date.now()), rangeMs: DAY_MS });
          }}
        />
      </Card>

      <Card title="Channel totals" hint={`Sessions, airtime and peaks per channel · last ${rangeLabel}`} icon={Trophy}>
        <StreamerTotals sessions={sessions ?? []} streamers={streamers} />
      </Card>

      <Card title="Top chatters" hint="Most active chatters across all channels, all-time" icon={MessagesSquare}>
        <TopChatters demo={demo} />
      </Card>

      <Card
        title="Stream sessions"
        hint="When each channel went live, ended, and how it drew"
        icon={History}
        className="lg:col-span-2"
        status={
          <span className="flex items-center gap-1">
            {SESSION_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setSessionRange(r.ms)}
                className={cn(
                  "rounded-md px-2 py-1 text-[0.68rem] font-semibold transition-colors",
                  sessionRange === r.ms ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </span>
        }
      >
        {sessions === null ? (
          <p className="text-[0.78rem] text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-[0.78rem] text-muted-foreground">
            No sessions in this window — they appear once the sampler has seen a stream live.
          </p>
        ) : (
          <SessionsTable
            sessions={sessions}
            streamers={streamers}
            onShare={(s) => void openSessionShare(s)}
            onPick={(s) => {
              const end = s.ongoing ? null : Math.min(s.end + 30 * 60_000, Date.now());
              // Snap to the smallest preset window that fits the session (plus margin).
              const span = (s.ongoing ? Date.now() : s.end) - s.start + 3600_000;
              const rangeMs = [3600_000, 6 * 3600_000, DAY_MS, 7 * DAY_MS].find((r) => r >= span) ?? 30 * DAY_MS;
              setPin({ end, rangeMs });
            }}
          />
        )}
      </Card>

      <ClipMomentsCard call={call} demo={demo} />

      <ShareDialog card={share} onClose={() => setShare(null)} />
    </div>
  );
}

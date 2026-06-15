"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Activity, Flame } from "lucide-react";

import { requestChatJump } from "@/lib/chat-jump";
import { useFeedContext } from "@/lib/chat/feed-context";
import { markDockActivity } from "@/lib/dock-activity";
import { hasDock, openPanel } from "@/lib/dock-api";
import { getHighlights, highlightsVersion, subscribeHighlights } from "@/lib/highlights-store";
import { cn } from "@/lib/utils";

const BUCKET_MS = 10_000; // sparkline resolution
const WINDOW_BUCKETS = 30; // 5 minutes of history
const LEADERBOARD_WINDOW_MS = 3 * 60_000;
const SPIKE_RATIO = 2.5; // last minute vs the window baseline
const SPIKE_MIN_MPM = 30; // never call a spike on a near-dead chat

const ACCENT = "#a8a8f8";

/** Filler words that would otherwise dominate any keyword leaderboard. */
const STOP_WORDS = new Set([
  "that", "this", "with", "have", "just", "what", "like", "they", "your", "from", "when",
  "will", "about", "there", "been", "were", "dont", "cant", "youre", "thats", "going",
  "gonna", "really", "because", "want", "know", "think", "right", "yeah", "good", "would",
  "could", "should", "them", "then", "than", "some", "here", "over", "even", "only", "more",
]);

function Sparkline({
  series,
  onSelectBucket,
  markerIndices,
}: {
  series: number[];
  onSelectBucket?: (index: number) => void;
  markerIndices?: number[];
}) {
  const W = 300;
  const H = 64;
  const max = Math.max(...series, 1);
  const pts = series.map((v, i) => [(i / (series.length - 1)) * W, H - 2 - (v / max) * (H - 8)]);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={cn("h-16 w-full", onSelectBucket && "cursor-pointer")}
      role={onSelectBucket ? "button" : undefined}
      aria-label={onSelectBucket ? "Jump chat to a moment on the timeline" : undefined}
      onClick={
        onSelectBucket
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const index = Math.min(
                series.length - 1,
                Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * series.length)),
              );
              onSelectBucket(index);
            }
          : undefined
      }
    >
      <title>Click to jump chat to that moment</title>
      <defs>
        <linearGradient id="hype-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={ACCENT} stopOpacity="0.28" />
          <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${W},${H} L0,${H} Z`} fill="url(#hype-fill)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      {markerIndices?.map((idx) => {
        const x = (idx / (series.length - 1)) * W;
        return (
          <polygon
            key={idx}
            points={`${x.toFixed(1)},${H - 1} ${(x - 3.5).toFixed(1)},${H - 7} ${(x + 3.5).toFixed(1)},${H - 7}`}
            fill="var(--feed-danger)"
            opacity="0.75"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

/**
 * Cross-platform chat velocity: messages/min sparkline over the last 5 minutes, spike detection,
 * and a rolling emote + keyword leaderboard. Counts are accumulated incrementally so they stay
 * correct even when the capped feed buffer trims old rows.
 */
export function HypeMeterPane() {
  const { messages } = useFeedContext();

  // bucketStart(ms) -> message count. Refs survive re-renders; a 2s tick advances the window.
  const bucketsRef = useRef<Map<number, number>>(new Map());
  const lastTsRef = useRef(0);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  // Count only messages newer than the last processed timestamp (buffer is time-ordered).
  useEffect(() => {
    let newest = lastTsRef.current;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.tsMs <= lastTsRef.current) break;
      const bucket = Math.floor(m.tsMs / BUCKET_MS) * BUCKET_MS;
      bucketsRef.current.set(bucket, (bucketsRef.current.get(bucket) ?? 0) + 1);
      if (m.tsMs > newest) newest = m.tsMs;
    }
    lastTsRef.current = newest;
    const cutoff = Date.now() - (WINDOW_BUCKETS + 2) * BUCKET_MS;
    for (const key of bucketsRef.current.keys()) if (key < cutoff) bucketsRef.current.delete(key);
  }, [messages]);

  const { series, mpm, peak, spikeRatio } = useMemo(() => {
    void tick; // re-derive every tick so the window slides without new messages
    const currentBucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const series = Array.from({ length: WINDOW_BUCKETS }, (_, i) => {
      const start = currentBucket - (WINDOW_BUCKETS - 1 - i) * BUCKET_MS;
      return bucketsRef.current.get(start) ?? 0;
    });
    const perMinute = 60_000 / BUCKET_MS;
    const lastMinute = series.slice(-6).reduce((a, b) => a + b, 0);
    const earlier = series.slice(0, -6);
    const baseline = earlier.length > 0 ? (earlier.reduce((a, b) => a + b, 0) / earlier.length) * perMinute : 0;
    const peak = Math.max(...series) * perMinute;
    const spikeRatio =
      lastMinute >= SPIKE_MIN_MPM && baseline > 0 && lastMinute / baseline >= SPIKE_RATIO
        ? lastMinute / baseline
        : null;
    return { series, mpm: lastMinute, peak, spikeRatio };
  }, [tick]);

  // Spike = new content for the dock tab dot, same as chat does for messages.
  useEffect(() => {
    if (spikeRatio) markDockActivity("hype");
  }, [spikeRatio]);

  useSyncExternalStore(subscribeHighlights, highlightsVersion, highlightsVersion);
  const markerIndices = useMemo(() => {
    const currentBucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    return getHighlights()
      .map((h) => WINDOW_BUCKETS - 1 - Math.floor((currentBucket - Math.floor(h.tsMs / BUCKET_MS) * BUCKET_MS) / BUCKET_MS))
      .filter((i) => i >= 0 && i < WINDOW_BUCKETS);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]); // re-derive every tick so markers slide with the window

  const { topEmotes, topWords } = useMemo(() => {
    const cutoff = Date.now() - LEADERBOARD_WINDOW_MS;
    const emotes = new Map<string, { url: string; count: number }>();
    const words = new Map<string, number>();
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.tsMs < cutoff) break;
      for (const seg of m.segments) {
        if (seg.type === "emote") {
          const e = emotes.get(seg.code);
          if (e) e.count += 1;
          else emotes.set(seg.code, { url: seg.url, count: 1 });
        } else if (seg.type === "text") {
          for (const w of seg.text.toLowerCase().split(/[^a-z0-9']+/)) {
            if (w.length < 4 || STOP_WORDS.has(w)) continue;
            words.set(w, (words.get(w) ?? 0) + 1);
          }
        }
      }
    }
    return {
      topEmotes: [...emotes.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 6),
      topWords: [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };
  }, [messages]);

  // Clicking the timeline jumps the chat feed to the first message in that bucket. Activate the
  // chat panel first — the virtualizer can't scroll while its container is a hidden dock tab.
  const jumpToBucket = (index: number) => {
    const currentBucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const start = currentBucket - (WINDOW_BUCKETS - 1 - index) * BUCKET_MS;
    const target = messages.find((m) => m.tsMs >= start) ?? messages[messages.length - 1];
    if (!target) return;
    if (hasDock()) openPanel("chat", "Chat");
    setTimeout(() => requestChatJump(target.id), 60);
  };

  const quiet = messages.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-hairline px-3">
        <Activity className="size-4 text-muted-foreground" />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">Hype Meter</span>
        <span className="ml-auto flex items-baseline gap-1">
          <span className={cn("font-mono text-[1.05rem] font-bold tabular-nums leading-none", spikeRatio ? "text-feed-danger" : "text-foreground")}>
            {mpm}
          </span>
          <span className="text-[0.62rem] text-muted-foreground">msg/min</span>
        </span>
      </header>

      {quiet ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <Activity className="size-7 text-muted-foreground/40" />
          <span className="text-sm font-medium text-muted-foreground">Waiting for chat…</span>
          <span className="text-xs text-muted-foreground/60">Chat velocity, top emotes, and trending words show up here</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-3 py-3 mb-scroll">
          {spikeRatio ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-feed-danger/25 bg-feed-danger/[0.08] px-3 py-2">
              <Flame className="size-4 flex-none text-feed-danger" />
              <span className="text-[0.78rem] font-medium text-foreground">
                Chat is erupting — <b className="font-mono tabular-nums">{spikeRatio.toFixed(1)}×</b> the usual pace
              </span>
            </div>
          ) : null}

          <Sparkline series={series} onSelectBucket={jumpToBucket} markerIndices={markerIndices} />
          <div className="mt-1 flex items-center justify-between text-[0.6rem] text-muted-foreground/60">
            <span>5 min ago</span>
            <span>click a spike to jump chat · peak {Math.round(peak)}/min</span>
            <span>now</span>
          </div>

          {topEmotes.length > 0 ? (
            <section className="mt-4">
              <h4 className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Top emotes · 3 min
              </h4>
              <ul className="flex flex-wrap gap-1.5">
                {topEmotes.map(([code, e]) => (
                  <li key={code} className="flex items-center gap-1.5 rounded-lg bg-overlay-weak px-2 py-1" title={code}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={e.url} alt={code} className="size-5" />
                    <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">{e.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {topWords.length > 0 ? (
            <section className="mt-4">
              <h4 className="mb-2 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Trending words · 3 min
              </h4>
              <ul className="flex flex-col gap-1">
                {topWords.map(([word, count]) => {
                  const max = topWords[0][1];
                  return (
                    <li key={word} className="relative flex items-center gap-2 overflow-hidden rounded-md px-2 py-1">
                      <span
                        className="absolute inset-y-0 left-0 bg-overlay-weak"
                        style={{ width: `${(count / max) * 100}%` }}
                        aria-hidden
                      />
                      <span className="relative min-w-0 flex-1 truncate text-[0.78rem] text-foreground/90">{word}</span>
                      <span className="relative font-mono text-[0.68rem] tabular-nums text-muted-foreground">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

import { useFeedContext } from "@/lib/chat/feed-context";
import { markDockActivity } from "@/lib/dock-activity";
import { isEventType, type Segment } from "@/lib/feed/types";
import { addHighlight, type HighlightExcerpt } from "@/lib/highlights-store";

// Keep in sync with hype-meter-pane.tsx
const BUCKET_MS = 10_000;
const WINDOW_BUCKETS = 30;
const SPIKE_RATIO = 2.5;
const SPIKE_MIN_MPM = 30;
const EXCERPT_COUNT = 4;
const EXCERPT_WINDOW_MS = 60_000;

function segmentsToText(segs: Segment[]): string {
  return segs
    .map((s) => {
      if (s.type === "text") return s.text;
      if (s.type === "emote") return s.code;
      if (s.type === "mention") return `@${s.user}`;
      if (s.type === "cashtag") return `$${s.symbol}`;
      return "";
    })
    .join("")
    .trim()
    .slice(0, 100);
}

/**
 * Headless bridge that mirrors the Hype Meter's spike detection and writes each new spike
 * to the highlights store. Runs continuously regardless of whether the panels are open.
 */
export function HighlightsBridge() {
  const { messages } = useFeedContext();
  const bucketsRef = useRef<Map<number, number>>(new Map());
  const lastTsRef = useRef(0);
  const wasSpike = useRef(false);

  useEffect(() => {
    // Accumulate new messages into buckets (same incremental pattern as HypeMeterPane).
    let newest = lastTsRef.current;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.tsMs <= lastTsRef.current) break;
      const bucket = Math.floor(m.tsMs / BUCKET_MS) * BUCKET_MS;
      bucketsRef.current.set(bucket, (bucketsRef.current.get(bucket) ?? 0) + 1);
      if (m.tsMs > newest) newest = m.tsMs;
    }
    lastTsRef.current = newest;

    // Evict stale buckets.
    const cutoff = Date.now() - (WINDOW_BUCKETS + 2) * BUCKET_MS;
    for (const k of bucketsRef.current.keys()) if (k < cutoff) bucketsRef.current.delete(k);

    // Compute spike (same formula as HypeMeterPane).
    const currentBucket = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
    const series = Array.from({ length: WINDOW_BUCKETS }, (_, i) => {
      const start = currentBucket - (WINDOW_BUCKETS - 1 - i) * BUCKET_MS;
      return bucketsRef.current.get(start) ?? 0;
    });
    const perMinute = 60_000 / BUCKET_MS;
    const lastMinute = series.slice(-6).reduce((a, b) => a + b, 0);
    const earlier = series.slice(0, -6);
    const baseline =
      earlier.length > 0 ? (earlier.reduce((a, b) => a + b, 0) / earlier.length) * perMinute : 0;
    const spikeRatio =
      lastMinute >= SPIKE_MIN_MPM && baseline > 0 && lastMinute / baseline >= SPIKE_RATIO
        ? lastMinute / baseline
        : null;

    if (spikeRatio && !wasSpike.current) {
      // Leading edge — record the moment once and notify the highlights panel.
      wasSpike.current = true;
      const now = Date.now();
      const excerptCutoff = now - EXCERPT_WINDOW_MS;
      const excerpts: HighlightExcerpt[] = [];
      let anchorMsgId: string | undefined;

      for (let i = messages.length - 1; i >= 0 && excerpts.length < EXCERPT_COUNT; i--) {
        const m = messages[i];
        if (m.tsMs < excerptCutoff) break;
        if (isEventType(m.type) || !m.author) continue;
        const text = segmentsToText(m.segments);
        if (!text) continue;
        excerpts.unshift({ author: m.author, text, platform: m.platform, color: m.authorColor });
        if (!anchorMsgId) anchorMsgId = m.id;
      }

      addHighlight({ id: String(now), tsMs: now, ratio: spikeRatio, mpm: lastMinute, excerpts, anchorMsgId });
      markDockActivity("highlights");
    } else if (!spikeRatio) {
      wasSpike.current = false;
    }
  }, [messages]);

  return null;
}

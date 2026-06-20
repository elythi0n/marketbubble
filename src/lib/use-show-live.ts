"use client";

import { useEffect, useState } from "react";

import { DEFAULT_SCHEDULE, formatCountdown, isStarting, nextOccurrence } from "@/lib/streamers/schedule";

const POLL_MS = 30_000;

export interface ShowLiveState {
  /** True once `/api/live` has reported any roster channel live. */
  live: boolean;
  /** Combined live viewers across platforms (deduped shared X account). */
  viewers: number;
  /** True until the first poll resolves — gate time-dependent UI on this to avoid SSR mismatch. */
  loading: boolean;
  /** In the post-slot grace window but not yet detected live ("show is starting"). */
  starting: boolean;
  /** Compact "2d 4h" / "12m" until the next scheduled slot. */
  countdown: string;
  /** Human schedule label, e.g. "THURSDAYS 1PM PT". */
  scheduleLabel: string;
}

/**
 * Live-status for the marketing homepage. Polls the aggregate `/api/live` endpoint and, in
 * parallel, ticks a local clock so the "next show" countdown stays fresh. `loading` stays true
 * through the first poll so callers can render a stable placeholder and dodge hydration mismatch
 * on the time-derived text.
 */
export function useShowLive(): ShowLiveState {
  const [data, setData] = useState<{ live: boolean; viewers: number; loading: boolean; schedule: string }>({
    live: false,
    viewers: 0,
    loading: true,
    schedule: DEFAULT_SCHEDULE.label,
  });
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { live?: boolean; viewers?: number; schedule?: string };
        if (!cancelled)
          setData({ live: !!d.live, viewers: d.viewers ?? 0, loading: false, schedule: d.schedule || DEFAULT_SCHEDULE.label });
      } catch {
        if (!cancelled) setData((prev) => ({ ...prev, loading: false }));
      }
    };
    void poll();
    const id = window.setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const next = nextOccurrence(DEFAULT_SCHEDULE, now);
  return {
    live: data.live,
    viewers: data.viewers,
    loading: data.loading,
    starting: !data.live && isStarting(DEFAULT_SCHEDULE, now),
    countdown: formatCountdown(next.getTime() - now.getTime()),
    scheduleLabel: data.schedule,
  };
}

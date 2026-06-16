"use client";

import { useEffect, useRef, useState } from "react";

import type { StreamStatusPayload } from "@/app/api/twitch/stream/route";
import type { Platform } from "@/lib/feed/types";
import { fetchKickStreamStatus } from "./kick-status";
import { getHandle, type Streamer } from "./mock";

const POLL_MS = 60_000;
const SELECTED_POLL_MS = 30_000;
/** How many consecutive failed polls may reuse the last-known status before degrading to offline. */
const MAX_HELD_MISSES = 2;

interface MergedStatus {
  live: boolean;
  viewers: number;
  title: string;
  livePlatform?: Platform;
  livePlatforms?: Platform[];
  viewersByPlatform?: Partial<Record<Platform, number>>;
  thumbnail?: string;
}

/**
 * Returns the given roster with real-time live status (live/offline, viewer count, title,
 * thumbnail) merged in. Status is polled from Twitch and Kick every 60 s, with the selected
 * streamer refreshed every 30 s. Re-polls immediately when the roster itself changes (e.g. when
 * switching between the live show roster and the demo roster).
 */
export interface UseStreamersResult {
  streamers: Streamer[];
  /** True once a full-roster poll has completed for the current roster (real live status known). */
  polled: boolean;
}

export function useStreamers(roster: Streamer[], selectedId?: string): UseStreamersResult {
  const [statuses, setStatuses] = useState<Record<string, MergedStatus>>({});
  const [polledKey, setPolledKey] = useState<string | null>(null);
  // Consecutive failed polls per channel; lets a network blip reuse the last-known status
  // instead of flashing everyone offline (and wrongly summoning the "nobody's live" nudge).
  const missesRef = useRef<Record<string, number>>({});

  const rosterRef = useRef(roster);
  rosterRef.current = roster;
  // Stable signature of the current roster; drives re-polling when the set of channels changes.
  const rosterKey = roster.map((s) => s.id).join(",");

  // Poll live status for a single streamer — both Twitch and Kick.
  async function pollOne(s: Streamer): Promise<[string, MergedStatus] | null> {
    // X-only (no Twitch/Kick) channels: ask the server bridge for live status + occupancy so they
    // show real viewer counts like everyone else. When the bridge isn't watching this handle
    // (e.g. demo without X_BROADCAST_SOURCES), fall back to the statically configured status so
    // demo X accounts still read as live.
    if (!s.platforms.includes("twitch") && !s.platforms.includes("kick")) {
      const xHandle = s.handles.x;
      if (xHandle) {
        try {
          const r = await fetch(`/api/x/stream?handle=${encodeURIComponent(xHandle)}`, { cache: "no-store" });
          if (r.ok) {
            const d = (await r.json()) as { tracked?: boolean; live?: boolean; viewers?: number; title?: string };
            // When the bridge is watching this handle, it owns the truth — including flipping the
            // channel offline once the broadcast ends (no stale "Live").
            if (d.tracked) {
              if (d.live) {
                const viewers = d.viewers ?? s.viewers;
                return [s.id, { live: true, viewers, title: d.title || s.title, livePlatform: "x", livePlatforms: ["x"], viewersByPlatform: { x: viewers } }];
              }
              return [s.id, { live: false, viewers: 0, title: s.title }];
            }
          }
        } catch {
          /* bridge unreachable — fall through to the static config */
        }
      }
      // Not tracked by the bridge (e.g. demo without X_BROADCAST_SOURCES): honor the static config.
      return [s.id, s.live
        ? { live: true, viewers: s.viewers, title: s.title, livePlatform: "x", livePlatforms: ["x"], viewersByPlatform: { x: s.viewers } }
        : { live: false, viewers: 0, title: s.title }];
    }

    let twitchLive = false;
    let kickLive = false;
    let twitchViewers = 0;
    let kickViewers = 0;
    let twitchTitle = "";
    let kickTitle = "";
    let twitchThumb: string | undefined;
    let kickThumb: string | undefined;
    let twitchKnown = false;
    let kickKnown = false;

    const promises: Promise<void>[] = [];

    if (s.platforms.includes("twitch")) {
      promises.push(
        fetch(`/api/twitch/stream?login=${encodeURIComponent(getHandle(s, "twitch"))}`, { cache: "no-store" })
          .then((r) => r.ok ? r.json() as Promise<StreamStatusPayload> : null)
          .then((d) => {
            if (d?.live !== null && d?.live !== undefined) {
              twitchLive = !!d.live;
              twitchViewers = d.viewerCount ?? 0;
              twitchTitle = d.title ?? "";
              twitchThumb = d.thumbnail;
              twitchKnown = true;
            }
          })
          .catch(() => {}),
      );
    }

    if (s.platforms.includes("kick")) {
      promises.push(
        fetchKickStreamStatus(getHandle(s, "kick"))
          .then((d) => {
            if (d) {
              kickLive = !!d.live;
              kickViewers = d.viewerCount ?? 0;
              kickTitle = d.title ?? "";
              kickThumb = d.thumbnail;
              kickKnown = true;
            }
          })
          .catch(() => {}),
      );
    }

    await Promise.all(promises);

    // If we got no response from any platform, skip the update.
    if (!twitchKnown && !kickKnown) return null;

    const live = twitchLive || kickLive;

    // Prefer the platform with more viewers; fall back to whichever is live.
    let livePlatform: Platform | undefined;
    if (kickLive && twitchLive) {
      livePlatform = kickViewers >= twitchViewers ? "kick" : "twitch";
    } else if (kickLive) {
      livePlatform = "kick";
    } else if (twitchLive) {
      livePlatform = "twitch";
    }

    const viewers = livePlatform === "kick" ? kickViewers : twitchViewers;
    const title = livePlatform === "kick" ? kickTitle : twitchTitle;
    const thumbnail = livePlatform === "kick" ? kickThumb : twitchThumb;

    const livePlatforms: Platform[] = [];
    const viewersByPlatform: Partial<Record<Platform, number>> = {};
    if (twitchLive) {
      livePlatforms.push("twitch");
      viewersByPlatform.twitch = twitchViewers;
    }
    if (kickLive) {
      livePlatforms.push("kick");
      viewersByPlatform.kick = kickViewers;
    }

    return [s.id, { live, viewers, title, livePlatform, livePlatforms, viewersByPlatform, thumbnail }];
  }

  // Full-roster polling loop. Re-runs when the roster set changes so a new roster polls right away.
  // The cancelled flag discards in-flight results from a superseded roster — without it, toggling
  // demo/live lets the old roster's slower poll land last, overwriting the fresh statuses and
  // polledKey and leaving everyone "offline" until the next interval tick.
  useEffect(() => {
    let cancelled = false;

    const pollAll = async () => {
      const roster = rosterRef.current;
      const key = roster.map((s) => s.id).join(",");
      const results = await Promise.allSettled(roster.map(pollOne));
      if (cancelled) return;
      setStatuses((prev) => {
        const next: Record<string, MergedStatus> = {};
        roster.forEach((s, i) => {
          const r = results[i];
          if (r.status === "fulfilled" && r.value) {
            const [id, status] = r.value;
            missesRef.current[id] = 0;
            next[id] = status;
          } else {
            // No response from any platform. Hold the last-known status through brief blips,
            // but degrade to offline once the misses persist (don't keep stale "live" forever).
            const misses = (missesRef.current[s.id] ?? 0) + 1;
            missesRef.current[s.id] = misses;
            const last = prev[s.id];
            next[s.id] =
              last && misses <= MAX_HELD_MISSES ? last : { live: false, viewers: 0, title: s.title ?? "" };
          }
        });
        return next;
      });
      setPolledKey(key);
    };

    pollAll();
    const id = setInterval(pollAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [rosterKey]);

  // Immediate re-poll + 30 s refresh loop for the selected streamer.
  // Matches the API cache TTL so every tick gets genuinely fresh data.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;

    const pollSelected = () => {
      const s = rosterRef.current.find((r) => r.id === selectedId);
      if (!s) return;
      pollOne(s).then((result) => {
        if (cancelled || !result) return;
        const [id, status] = result;
        setStatuses((prev) => ({ ...prev, [id]: status }));
      });
    };

    pollSelected();
    const id = setInterval(pollSelected, SELECTED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedId, rosterKey]);

  const streamers = roster.map((s) => {
    const st = statuses[s.id];
    if (!st) return s;
    return {
      ...s,
      live: st.live,
      viewers: st.viewers,
      title: st.title || s.title,
      livePlatform: st.livePlatform,
      livePlatforms: st.livePlatforms,
      viewersByPlatform: st.viewersByPlatform,
      thumbnail: st.thumbnail,
    };
  });

  return { streamers, polled: polledKey === rosterKey };
}

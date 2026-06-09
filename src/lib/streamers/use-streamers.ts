"use client";

import { useEffect, useRef, useState } from "react";

import type { StreamStatusPayload } from "@/app/api/twitch/stream/route";
import type { KickStreamPayload } from "@/app/api/kick/stream/route";
import type { Platform } from "@/lib/feed/types";
import { getHandle, MOCK_STREAMERS, type Streamer } from "./mock";

const POLL_MS = 60_000;
const SELECTED_POLL_MS = 30_000;

interface MergedStatus {
  live: boolean;
  viewers: number;
  title: string;
  livePlatform?: Platform;
  thumbnail?: string;
}

/**
 * Returns the full streamer roster with real-time live status merged in.
 * Roster is fetched from /api/streamers. Live status is polled from Twitch and Kick
 * every 60 s and immediately whenever selectedId changes.
 */
export function useStreamers(selectedId?: string): Streamer[] {
  const [roster, setRoster] = useState<Streamer[]>(MOCK_STREAMERS);
  // Seed live from mock so the initial render doesn't flash the offline panel while polls are in-flight.
  // Viewers start at 0 — real count arrives from the first poll (~500 ms) and AnimatedNumber counts up.
  const [statuses, setStatuses] = useState<Record<string, MergedStatus>>(() =>
    Object.fromEntries(
      MOCK_STREAMERS.map((s) => [s.id, { live: s.live, viewers: 0, title: s.title, thumbnail: undefined }]),
    ),
  );

  const rosterRef = useRef(roster);
  rosterRef.current = roster;

  // Fetch the configured roster once on mount.
  useEffect(() => {
    fetch("/api/streamers")
      .then((r) => r.json())
      .then((data: Streamer[]) => { if (Array.isArray(data)) setRoster(data); })
      .catch(() => { /* keep MOCK_STREAMERS */ });
  }, []);

  // Poll live status for a single streamer — both Twitch and Kick.
  async function pollOne(s: Streamer): Promise<[string, MergedStatus] | null> {
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
        fetch(`/api/twitch/stream?login=${encodeURIComponent(getHandle(s, "twitch"))}`)
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
        fetch(`/api/kick/stream?slug=${encodeURIComponent(getHandle(s, "kick"))}`)
          .then((r) => r.ok ? r.json() as Promise<KickStreamPayload> : null)
          .then((d) => {
            if (d?.live !== null && d?.live !== undefined) {
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

    return [s.id, { live, viewers, title, livePlatform, thumbnail }];
  }

  // Poll all streamers.
  async function pollAll() {
    const results = await Promise.allSettled(rosterRef.current.map(pollOne));
    const next: Record<string, MergedStatus> = {};
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        const [id, status] = r.value;
        next[id] = status;
      }
    }
    if (Object.keys(next).length > 0) {
      setStatuses((prev) => ({ ...prev, ...next }));
    }
  }

  // Full-roster polling loop.
  useEffect(() => {
    pollAll();
    const id = setInterval(pollAll, POLL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Immediate re-poll + 30 s refresh loop for the selected streamer.
  // Matches the API cache TTL so every tick gets genuinely fresh data.
  useEffect(() => {
    if (!selectedId) return;

    const pollSelected = () => {
      const s = rosterRef.current.find((r) => r.id === selectedId);
      if (!s) return;
      pollOne(s).then((result) => {
        if (result) {
          const [id, status] = result;
          setStatuses((prev) => ({ ...prev, [id]: status }));
        }
      });
    };

    pollSelected();
    const id = setInterval(pollSelected, SELECTED_POLL_MS);
    return () => clearInterval(id);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  return roster.map((s) => {
    const st = statuses[s.id];
    if (!st) return s;
    return {
      ...s,
      live: st.live,
      viewers: st.viewers,
      title: st.title || s.title,
      livePlatform: st.livePlatform,
      thumbnail: st.thumbnail,
    };
  });
}

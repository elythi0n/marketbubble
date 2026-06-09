"use client";

import { useEffect, useRef, useState } from "react";

import type { StreamStatusPayload } from "@/app/api/twitch/stream/route";
import { getHandle, type Streamer } from "./mock";

export interface LiveStatus {
  /** null = API not configured; use fallback from MOCK_STREAMERS. */
  live: boolean | null;
  viewerCount: number;
  title: string;
}

const POLL_MS = 60_000;

/**
 * Polls the Twitch stream status API every minute.
 * Falls back to `streamer.live` / `streamer.viewers` when credentials are absent.
 */
export function useLiveStatus(streamer: Streamer): LiveStatus {
  const fallback: LiveStatus = {
    live: streamer.live,
    viewerCount: streamer.viewers,
    title: streamer.title,
  };

  const [status, setStatus] = useState<LiveStatus>(fallback);
  const streamerRef = useRef(streamer);
  streamerRef.current = streamer;

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/twitch/stream?login=${encodeURIComponent(getHandle(streamerRef.current, "twitch"))}`);
        if (!res.ok || cancelled) return;
        const data = await res.json() as StreamStatusPayload;
        if (cancelled) return;
        if (data.live === null) {
          // No credentials — keep using mock fallback.
          setStatus({
            live: streamerRef.current.live,
            viewerCount: streamerRef.current.viewers,
            title: streamerRef.current.title,
          });
        } else {
          setStatus(data);
        }
      } catch {}
    };

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [getHandle(streamer, "twitch")]);

  return status;
}

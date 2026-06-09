"use client";

import { useEffect, useState } from "react";

import { MOCK_CLIPS, type Clip } from "./clips";
import { getHandle, type Streamer } from "./mock";

export function useClips(streamer: Streamer): { clips: Clip[]; loading: boolean } {
  const [clips, setClips] = useState<Clip[]>(MOCK_CLIPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ login: getHandle(streamer, "twitch") });
    if (streamer.youtube) params.set("youtube", streamer.youtube);

    fetch(`/api/clips?${params}`)
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Clip[];
        if (!cancelled) setClips(data.length > 0 ? data : MOCK_CLIPS);
      })
      .catch(() => { /* keep mock */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [getHandle(streamer, "twitch"), streamer.youtube]);

  return { clips, loading };
}

"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { useDemoMode } from "@/lib/demo-mode-context";
import { DEMO_STREAMERS } from "./demo";
import { MOCK_STREAMERS, type Streamer } from "./mock";
import { useStreamers } from "./use-streamers";

const MERGE_KEY = "mb-merge-all";

interface ChannelContextValue {
  /** Real-time enriched roster (live status + viewer count from Twitch). */
  streamers: Streamer[];
  selectedId: string;
  select: (id: string) => void;
  /**
   * When true, the chat feed merges every live channel into one unified stream (each row keeps its
   * source channel). When false, the feed follows only the selected channel.
   */
  mergeAll: boolean;
  setMergeAll: (v: boolean) => void;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: { children: ReactNode }) {
  const { isDemo } = useDemoMode();
  const [selectedId, setSelectedId] = useState<string>(
    () => MOCK_STREAMERS.find((s) => s.live)?.id ?? MOCK_STREAMERS[0].id,
  );
  const [mergeAll, setMergeAllState] = useState(true);

  // Hydrate the merge preference after mount (avoids SSR mismatch); defaults on.
  useEffect(() => {
    const stored = localStorage.getItem(MERGE_KEY);
    if (stored !== null) setMergeAllState(stored === "1");
  }, []);

  const setMergeAll = (v: boolean) => {
    setMergeAllState(v);
    localStorage.setItem(MERGE_KEY, v ? "1" : "0");
  };

  // Live show roster, fetched once; demo uses the curated roster. Either way it's polled for real
  // live status, viewer counts, and thumbnails by useStreamers.
  const [liveRoster, setLiveRoster] = useState<Streamer[]>(MOCK_STREAMERS);
  useEffect(() => {
    fetch("/api/streamers")
      .then((r) => r.json())
      .then((data: Streamer[]) => { if (Array.isArray(data)) setLiveRoster(data); })
      .catch(() => { /* keep MOCK_STREAMERS */ });
  }, []);

  const baseRoster = isDemo ? DEMO_STREAMERS : liveRoster;
  const { streamers, polled } = useStreamers(baseRoster, selectedId);

  // When the active roster swaps (toggling demo, or the live roster loading), keep the selection
  // pointed at a real entry.
  const rosterKey = baseRoster.map((s) => s.id).join(",");
  useEffect(() => {
    setSelectedId((cur) => (baseRoster.some((s) => s.id === cur) ? cur : baseRoster[0]?.id ?? cur));
  }, [rosterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once real live status is in for a roster, land on the busiest live channel if the current
  // selection isn't live. Runs once per roster so it never overrides a manual pick afterward.
  const autoPicked = useRef(false);
  useEffect(() => {
    autoPicked.current = false;
  }, [rosterKey]);
  useEffect(() => {
    if (autoPicked.current || !polled) return;
    autoPicked.current = true;
    const live = streamers.filter((s) => s.live);
    if (live.length === 0) return;
    const current = streamers.find((s) => s.id === selectedId);
    if (!current?.live) {
      const top = [...live].sort((a, b) => b.viewers - a.viewers)[0];
      if (top) setSelectedId(top.id);
    }
  }, [polled, streamers, selectedId]);

  return (
    <ChannelContext.Provider value={{ streamers, selectedId, select: setSelectedId, mergeAll, setMergeAll }}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannel(): ChannelContextValue {
  const value = useContext(ChannelContext);
  if (!value) throw new Error("useChannel must be used within a ChannelProvider");
  return value;
}

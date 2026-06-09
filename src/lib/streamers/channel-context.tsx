"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { useDemoMode } from "@/lib/demo-mode-context";
import { MOCK_STREAMERS, type Streamer } from "./mock";
import { useStreamers } from "./use-streamers";

interface ChannelContextValue {
  /** Real-time enriched roster (live status + viewer count from Twitch). */
  streamers: Streamer[];
  selectedId: string;
  select: (id: string) => void;
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: { children: ReactNode }) {
  const { isDemo } = useDemoMode();
  const [selectedId, setSelectedId] = useState<string>(
    () => MOCK_STREAMERS.find((s) => s.live)?.id ?? MOCK_STREAMERS[0].id,
  );
  const liveStreamers = useStreamers(selectedId);
  const streamers = isDemo ? MOCK_STREAMERS : liveStreamers;
  return (
    <ChannelContext.Provider value={{ streamers, selectedId, select: setSelectedId }}>
      {children}
    </ChannelContext.Provider>
  );
}

export function useChannel(): ChannelContextValue {
  const value = useContext(ChannelContext);
  if (!value) throw new Error("useChannel must be used within a ChannelProvider");
  return value;
}

"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createTwitchIRCProvider } from "./providers/twitch-irc";
import { createKickProvider } from "./providers/kick-pusher";
import type { ChatProvider } from "./provider";
import { useFeed, type UseFeedResult } from "./use-feed";

const FeedContext = createContext<UseFeedResult | null>(null);

function defaultProviders(): ChatProvider[] {
  return [
    createTwitchIRCProvider({ channel: "fazebanks" }),
    createKickProvider({ slug: "fazebanks" }),
  ];
}

/**
 * Owns the unified chat stream for the whole dashboard. Both the chat pane and the stat band read
 * from this one aggregator, so message rate / unique chatters stay in sync with what's on screen.
 * Panels rendered inside dockview consume it through React context (portals preserve providers).
 */
export function FeedProvider({
  children,
  makeProviders = defaultProviders,
  providersKey,
}: {
  children: ReactNode;
  makeProviders?: () => ChatProvider[];
  /**
   * Changing this string rebuilds the chat connections (e.g. when the channel set changes) without
   * remounting the React subtree, so consumer UI state like sidebar expansion is preserved.
   */
  providersKey?: string;
}) {
  const value = useFeed(makeProviders, providersKey);
  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeedContext(): UseFeedResult {
  const value = useContext(FeedContext);
  if (!value) throw new Error("useFeedContext must be used within a FeedProvider");
  return value;
}

export interface FeedStats {
  messagesPerMinute: number;
  uniqueChatters: number;
  topEmote: string | null;
  /** Most-mentioned cashtag in chat, e.g. "$BTC". */
  topCashtag: string | null;
  /** Gift-like events seen this session (subs, resubs, gifted subs, raids). */
  giftCount: number;
}

/** Rolling stats derived from the in-memory message buffer. */
export function useFeedStats(): FeedStats {
  const { messages } = useFeedContext();
  return useMemo(() => {
    const now = messages.length ? messages[messages.length - 1].tsMs : 0;
    const windowStart = now - 60_000;
    const authors = new Set<string>();
    const emoteCounts = new Map<string, number>();
    const cashtagCounts = new Map<string, number>();
    let recent = 0;
    let giftCount = 0;
    for (const m of messages) {
      authors.add(m.author);
      if (m.tsMs >= windowStart) recent += 1;
      if (m.type === "sub" || m.type === "resub" || m.type === "giftsub" || m.type === "raid") giftCount += 1;
      for (const seg of m.segments) {
        if (seg.type === "emote") emoteCounts.set(seg.code, (emoteCounts.get(seg.code) ?? 0) + 1);
        else if (seg.type === "cashtag") cashtagCounts.set(seg.symbol, (cashtagCounts.get(seg.symbol) ?? 0) + 1);
      }
    }
    const top = (counts: Map<string, number>): string | null => {
      let best: string | null = null;
      let bestCount = 0;
      for (const [key, count] of counts) {
        if (count > bestCount) {
          bestCount = count;
          best = key;
        }
      }
      return best;
    };
    return {
      messagesPerMinute: recent,
      uniqueChatters: authors.size,
      topEmote: top(emoteCounts),
      topCashtag: top(cashtagCounts),
      giftCount,
    };
  }, [messages]);
}

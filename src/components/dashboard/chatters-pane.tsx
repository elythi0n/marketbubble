"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Hash, Search, Users, X } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { subscribeAuthorFocus, requestAuthorFocus } from "@/lib/chat-focus";
import { useFeedContext } from "@/lib/chat/feed-context";
import { hasDock, openPanel } from "@/lib/dock-api";
import { isEventType, type Platform } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

interface ChatterEntry {
  name: string;
  platform: Platform;
  msgCount: number;
  lastTs: number;
  color?: string;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

const PLATFORM_ORDER: Platform[] = ["twitch", "kick", "x"];

/**
 * Derives the list of active chatters from the live merged feed. No extra credentials needed —
 * anyone who has sent at least one message during this session appears here.
 * Sorted by message count descending so the most active chatters float to the top.
 */
export function ChattersPane() {
  const { messages } = useFeedContext();
  const [query, setQuery] = useState("");
  const [platformFilter, setPlatformFilter] = useState<Platform | null>(null);
  const [focusedAuthor, setFocusedAuthor] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"count" | "recent">("count");

  // Stay in sync when chat focus is cleared from within the chat pane itself.
  useEffect(() => subscribeAuthorFocus((a) => { if (a === null) setFocusedAuthor(null); }), []);

  const { chatters, byPlatform } = useMemo(() => {
    const map = new Map<string, ChatterEntry>();
    for (const m of messages) {
      if (!m.author || isEventType(m.type)) continue;
      const key = `${m.platform}:${m.author.toLowerCase()}`;
      const existing = map.get(key);
      if (existing) {
        existing.msgCount += 1;
        if (m.tsMs > existing.lastTs) {
          existing.lastTs = m.tsMs;
          if (m.authorColor) existing.color = m.authorColor;
        }
      } else {
        map.set(key, {
          name: m.author,
          platform: m.platform,
          msgCount: 1,
          lastTs: m.tsMs,
          color: m.authorColor,
        });
      }
    }
    const sorted = [...map.values()].sort((a, b) => b.msgCount - a.msgCount || b.lastTs - a.lastTs);
    const byPlatform: Partial<Record<Platform, number>> = {};
    for (const c of sorted) byPlatform[c.platform] = (byPlatform[c.platform] ?? 0) + 1;
    return { chatters: sorted, byPlatform };
  }, [messages]);

  const q = query.toLowerCase().trim();
  const filtered = chatters
    .filter((c) => !platformFilter || c.platform === platformFilter)
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .sort(sortBy === "recent" ? (a, b) => b.lastTs - a.lastTs : (a, b) => b.msgCount - a.msgCount || b.lastTs - a.lastTs);
  const quiet = chatters.length === 0;
  const multiPlatform = Object.keys(byPlatform).length > 1;

  const togglePlatform = (p: Platform) =>
    setPlatformFilter((cur) => (cur === p ? null : p));

  const onChatterClick = (name: string) => {
    const next = focusedAuthor?.toLowerCase() === name.toLowerCase() ? null : name;
    setFocusedAuthor(next);
    if (hasDock()) openPanel("chat", "Chat");
    requestAuthorFocus(next);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <Users className="size-4 text-muted-foreground" />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">Chat Roster</span>
        {chatters.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setSortBy((s) => (s === "count" ? "recent" : "count"))}
              title={sortBy === "count" ? "Sort by most recent" : "Sort by message count"}
              className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
            >
              {sortBy === "count" ? <Hash className="size-3" /> : <Clock className="size-3" />}
              <span className="text-[0.62rem] font-medium">{sortBy === "count" ? "count" : "recent"}</span>
            </button>
            <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
              {chatters.length.toLocaleString()}
            </span>
          </>
        ) : null}
      </header>

      {quiet ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <Users className="size-7 text-muted-foreground/40" />
          <span className="text-sm font-medium text-muted-foreground">No chatters yet</span>
          <span className="text-xs text-muted-foreground/60">
            Anyone who types in Twitch, Kick, or X chat appears here
          </span>
        </div>
      ) : (
        <>
          {/* Per-platform filter pills — click to show only that platform, click again to reset */}
          {multiPlatform ? (
            <div className="flex gap-1.5 border-b border-white/[0.06] px-3 py-1.5">
              {PLATFORM_ORDER.filter((p) => byPlatform[p]).map((p) => {
                const active = platformFilter === p;
                const dimmed = platformFilter !== null && !active;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePlatform(p)}
                    aria-pressed={active}
                    title={active ? "Show all platforms" : `Show only ${p}`}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-all",
                      active ? "bg-white/[0.1] ring-1 ring-white/[0.14]" : "bg-white/[0.04] hover:bg-white/[0.07]",
                      dimmed && "opacity-35",
                    )}
                  >
                    <PlatformGlyph platform={p} className="size-3" />
                    <span className="font-mono text-[0.64rem] tabular-nums text-muted-foreground">{byPlatform[p]}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Search bar */}
          <div className="flex items-center gap-1.5 border-b border-white/[0.06] px-3 py-1.5">
            <Search className="size-3 flex-none text-muted-foreground/50" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter chatters…"
              className="min-w-0 flex-1 bg-transparent text-[0.76rem] text-foreground outline-none placeholder:text-muted-foreground/40"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="flex size-4 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Clear filter"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>

          {/* Chatter list */}
          <ul className="mb-scroll flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-3 py-8 text-center text-[0.76rem] text-muted-foreground/60">
                {q
                  ? `No match for "${query}"${platformFilter ? ` on ${platformFilter}` : ""}`
                  : `No ${platformFilter} chatters yet`}
              </li>
            ) : (
              filtered.map((c) => {
                const isFocused = focusedAuthor?.toLowerCase() === c.name.toLowerCase();
                return (
                  <li key={`${c.platform}:${c.name}`} className="border-b border-white/[0.04] last:border-b-0">
                    <button
                      type="button"
                      onClick={() => onChatterClick(c.name)}
                      title={isFocused ? "Click to clear focus" : "Click to filter chat to this user"}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[0.05]",
                        isFocused && "bg-white/[0.07]",
                      )}
                    >
                      <PlatformGlyph platform={c.platform} className={cn("size-3 flex-none", !multiPlatform && "opacity-40")} />
                      <span
                        className="min-w-0 flex-1 truncate text-[0.82rem] font-medium text-foreground"
                        style={c.color ? { color: c.color } : undefined}
                      >
                        {c.name}
                      </span>
                      <span className="flex-none font-mono text-[0.66rem] tabular-nums text-muted-foreground">
                        {c.msgCount}
                      </span>
                      <span className="w-7 flex-none text-right font-mono text-[0.62rem] tabular-nums text-muted-foreground/45">
                        {timeAgo(c.lastTs)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <p className="flex-none border-t border-white/[0.05] px-3 py-1.5 text-[0.6rem] text-muted-foreground/45">
            Active chatters from session buffer · sorted by {sortBy === "count" ? "message count" : "most recent"}
          </p>
        </>
      )}
    </div>
  );
}

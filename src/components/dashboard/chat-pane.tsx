"use client";

import { useState } from "react";
import { Eye, Layers, MessagesSquare, Search, X, ZoomIn, ZoomOut } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReadHelper } from "@/hooks/use-read-helper";
import { useFeedContext } from "@/lib/chat/feed-context";
import type { ProviderStatus } from "@/lib/chat/provider";
import { useChannel } from "@/lib/streamers/channel-context";
import { useStageMode } from "@/lib/stage-mode-context";
import { PLATFORM_LABEL, PLATFORMS, type FeedMessage } from "@/lib/feed/types";

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.6;
const STEP = 0.1;

const STATUS_LABEL: Record<ProviderStatus, string> = {
  open: "Connected",
  connecting: "Connecting…",
  closed: "Disconnected",
  error: "Connection error",
};

/** Does a message match the search query (author or any text/emote/mention/cashtag/link run)? */
function matchesQuery(m: FeedMessage, q: string): boolean {
  if (m.author.toLowerCase().includes(q)) return true;
  for (const seg of m.segments) {
    const t =
      seg.type === "text" ? seg.text
      : seg.type === "emote" ? seg.code
      : seg.type === "mention" ? seg.user
      : seg.type === "cashtag" ? seg.symbol
      : seg.type === "link" ? seg.text
      : "";
    if (t.toLowerCase().includes(q)) return true;
  }
  return false;
}

function chatEmptyState(statuses: Readonly<Record<string, ProviderStatus>>): { label: string; subtext: string } {
  const vals = Object.values(statuses) as ProviderStatus[];
  if (vals.length === 0 || vals.every((s) => s === "connecting")) {
    return { label: "Connecting to chat…", subtext: "Joining the channel" };
  }
  if (vals.every((s) => s === "error" || s === "closed")) {
    return { label: "Reconnecting…", subtext: "Lost connection, retrying" };
  }
  return { label: "Chat is quiet", subtext: "Messages will appear here when people chat" };
}

export function ChatPane() {
  const { messages, statuses } = useFeedContext();
  const { mergeAll, setMergeAll, selectedId, streamers } = useChannel();
  const { isStage } = useStageMode();
  const selectedName = streamers.find((s) => s.id === selectedId)?.name ?? "Channel";
  const [scale, setScale] = useState(1.2);
  const [readHelper, setReadHelper] = useState(false);
  const [query, setQuery] = useState("");

  const { displayed, queueDepth } = useReadHelper(messages, readHelper);

  // When searching, filter the full buffer (bypassing the read-helper throttle).
  const q = query.trim().toLowerCase();
  const shown = q ? messages.filter((m) => matchesQuery(m, q)) : displayed;
  const emptyState = q
    ? { label: "No matches", subtext: `No messages match “${query.trim()}”` }
    : chatEmptyState(statuses);

  // While Stage is open, chat lives there; don't also render this feed behind the overlay.
  if (isStage) {
    return (
      <div className="flex h-full items-center justify-center bg-card text-sm text-muted-foreground">
        Chat is in Stage
      </div>
    );
  }

  const zoom = (delta: number) =>
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((s + delta) * 10) / 10)));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <TooltipProvider>
        {/* Options bar */}
        <header className="flex h-11 flex-none items-center gap-1.5 border-b border-white/[0.07] px-3">
          {/* Zoom group */}
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => zoom(-STEP)}
                    disabled={scale <= MIN_SCALE}
                    aria-label="Make chat smaller"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    <ZoomOut className="size-4" />
                  </button>
                }
              />
              <TooltipContent>Make chat smaller</TooltipContent>
            </Tooltip>
            <span className="min-w-[2.6ch] text-center font-mono text-[0.64rem] tabular-nums text-muted-foreground">
              {Math.round(scale * 100)}%
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => zoom(STEP)}
                    disabled={scale >= MAX_SCALE}
                    aria-label="Make chat bigger"
                    className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
                  >
                    <ZoomIn className="size-4" />
                  </button>
                }
              />
              <TooltipContent>Make chat bigger</TooltipContent>
            </Tooltip>
          </div>

          {/* Read helper toggle */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setReadHelper((v) => !v)}
                  aria-pressed={readHelper}
                  aria-label={readHelper ? "Turn off read helper" : "Turn on read helper"}
                  className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 transition-colors ${
                    readHelper
                      ? "bg-[#a8a8f8]/12 text-[#a8a8f8] hover:bg-[#a8a8f8]/18"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <Eye className="size-4" />
                  {readHelper && queueDepth > 0 ? (
                    <span className="min-w-[1.4ch] font-mono text-[0.64rem] tabular-nums leading-none">
                      {queueDepth > 99 ? "99+" : queueDepth}
                    </span>
                  ) : null}
                </button>
              }
            />
            <TooltipContent>
              {readHelper ? "Slowing chat for easier reading. Click to turn off." : "Slow chat down so it's easier to read"}
            </TooltipContent>
          </Tooltip>

          {/* Feed scope: merge every live channel into one stream, or follow only the selected one. */}
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setMergeAll(!mergeAll)}
                  aria-pressed={mergeAll}
                  className={`inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2.5 transition-colors ${
                    mergeAll
                      ? "bg-white/[0.08] text-foreground hover:bg-white/[0.12]"
                      : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
                  }`}
                >
                  <Layers className="size-4 shrink-0" />
                  <span className="max-w-[7rem] truncate text-[0.72rem] font-medium leading-none">
                    {mergeAll ? "All channels" : selectedName}
                  </span>
                </button>
              }
            />
            <TooltipContent>
              {mergeAll ? "Showing all live channels. Click to follow only the selected one." : `Following ${selectedName} only. Click to merge all live channels.`}
            </TooltipContent>
          </Tooltip>

          <span className="ml-auto flex flex-none items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5">
            {PLATFORMS.map((platform) => {
              // Find the status for any provider whose id starts with the platform name.
              const status = Object.entries(statuses).find(([id]) => id.startsWith(platform))?.[1];
              const connected = status === "open";
              if (status === undefined) return null;
              return (
                <Tooltip key={platform}>
                  <TooltipTrigger
                    render={
                      <span className={`flex items-center transition-opacity ${connected ? "opacity-100" : "opacity-30"}`}>
                        <PlatformGlyph platform={platform} className="size-4" />
                      </span>
                    }
                  />
                  <TooltipContent>
                    {PLATFORM_LABEL[platform]} · {STATUS_LABEL[status]}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </span>
        </header>

        {/* Full-width search */}
        <div className="flex-none border-b border-white/[0.07] px-2.5 py-2">
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.05]">
            <Search className="size-4 flex-none text-muted-foreground/70" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chat"
              aria-label="Search chat"
              className="min-w-0 flex-1 bg-transparent text-[0.82rem] text-foreground outline-none placeholder:text-muted-foreground/45"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex size-5 flex-none items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-white/[0.08] hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </TooltipProvider>

      <Feed
        messages={shown}
        showSource
        scale={scale}
        readHelper={readHelper && !q}
        emptyIcon={MessagesSquare}
        emptyLabel={emptyState.label}
        emptySubtext={emptyState.subtext}
      />
    </div>
  );
}

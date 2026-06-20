"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AtSign, Check, Eye, Layers, ListFilter, MessagesSquare, Search, X, ZoomIn, ZoomOut } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useUserCard } from "@/components/feed/user-card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useReadHelper } from "@/hooks/use-read-helper";
import { useFeedContext } from "@/lib/chat/feed-context";
import type { ProviderStatus } from "@/lib/chat/provider";
import { useChatRowMenu } from "./chat-row-menu";
import { subscribeChatJump } from "@/lib/chat-jump";
import { requestAuthorFocus, subscribeAuthorFocus } from "@/lib/chat-focus";
import { markDockActivity } from "@/lib/dock-activity";
import { useSettings } from "@/lib/settings/settings-context";
import { useFilteredMessages } from "@/lib/settings/use-filtered-messages";
import { useChannel } from "@/lib/streamers/channel-context";
import { type Streamer } from "@/lib/streamers/mock";
import { useStageMode } from "@/lib/stage-mode-context";
import { PLATFORM_LABEL, PLATFORMS, type FeedMessage } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

const HIDDEN_KEY = "mb-hidden-channels-v1";

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.6;
const DEFAULT_SCALE = 1.2;
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

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Per-channel visibility for the merged feed: a dropdown of live channels with checkboxes. */
function ChannelFilter({
  channels,
  hiddenIds,
  onToggle,
  onShowAll,
}: {
  channels: Streamer[];
  hiddenIds: readonly string[];
  onToggle: (id: string) => void;
  onShowAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hidden = new Set(hiddenIds);
  const visibleCount = channels.filter((s) => !hidden.has(s.id)).length;
  const filtering = visibleCount < channels.length;

  return (
    <div className="relative flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Choose which channels show in the merged feed"
              className={cn(
                "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 transition-colors",
                filtering
                  ? "bg-overlay-medium text-foreground hover:bg-overlay-strong"
                  : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground",
              )}
            >
              <ListFilter className="size-4" />
              {filtering ? (
                <span className="font-mono text-[0.64rem] tabular-nums leading-none">
                  {visibleCount}/{channels.length}
                </span>
              ) : null}
            </button>
          }
        />
        <TooltipContent>Choose which channels show in the merged feed</TooltipContent>
      </Tooltip>

      {open ? (
        <>
          <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-[100] mt-1.5 w-56 rounded-lg border border-hairline-strong bg-card p-1 shadow-[var(--shadow-popover)]">
            <p className="px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Channels in feed</p>
            {channels.map((s) => {
              const shown = !hidden.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onToggle(s.id)}
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8rem] text-foreground/90 transition-colors hover:bg-overlay-medium hover:text-foreground"
                >
                  <span
                    className={cn(
                      "flex size-4 flex-none items-center justify-center rounded border transition-colors",
                      shown ? "border-transparent bg-foreground text-background" : "border-hairline-strong bg-overlay-weak",
                    )}
                  >
                    {shown ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("flex flex-none items-center gap-1", !s.live && "opacity-50")}>
                    {s.platforms.map((p) => (
                      <PlatformGlyph key={p} platform={p} className="size-3.5" />
                    ))}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate", !s.live && "text-muted-foreground")}>{s.name}</span>
                  <span className="flex-none font-mono text-[0.64rem] tabular-nums text-muted-foreground">
                    {s.live ? formatCount(s.viewers) : "offline"}
                  </span>
                </button>
              );
            })}
            {filtering ? (
              <button
                type="button"
                onClick={onShowAll}
                className="mt-0.5 flex w-full items-center justify-center rounded-md border-t border-hairline px-2 py-1.5 text-[0.7rem] font-medium text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
              >
                Show all channels
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
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
  const { settings } = useSettings();
  const selectedName = streamers.find((s) => s.id === selectedId)?.name ?? "Channel";
  const [scale, setScale] = useState(DEFAULT_SCALE);
  const [readHelper, setReadHelper] = useState(false);
  const [query, setQuery] = useState("");
  const [focusAuthor, setFocusAuthor] = useState<string | null>(null);
  // Wrapper that keeps other panels (e.g. Chat Roster) in sync whenever focus changes locally.
  const changeFocusAuthor = useCallback((author: string | null) => {
    setFocusAuthor(author);
    requestAuthorFocus(author);
  }, []);

  // Per-channel visibility in the merged feed, persisted across reloads.
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HIDDEN_KEY);
      if (raw) setHiddenIds(JSON.parse(raw) as string[]);
    } catch {}
  }, []);
  const saveHidden = (next: string[]) => {
    setHiddenIds(next);
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
    } catch {}
  };
  const toggleChannel = (id: string) =>
    saveHidden(hiddenIds.includes(id) ? hiddenIds.filter((x) => x !== id) : [...hiddenIds, id]);

  // Merge mode connects every roster channel — offline ones too — because people keep chatting
  // when a streamer is offline. So the filter lists all channels (live first), not just live ones.
  const feedChannels = useMemo(
    () => [...streamers].sort((a, b) => Number(b.live) - Number(a.live)),
    [streamers],
  );

  // Messages carry the platform handle as `channel`; map handles back to roster entries.
  const handleToStreamer = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of streamers) for (const h of Object.values(s.handles)) if (h) map.set(h.toLowerCase(), s.id);
    return map;
  }, [streamers]);

  // Display pipeline: filter rules (mute/highlight) → channel visibility → author focus.
  const filtered = useFilteredMessages(messages);
  const base = useMemo(() => {
    let out = filtered;
    if (mergeAll && hiddenIds.length > 0) {
      const hidden = new Set(hiddenIds);
      out = out.filter((m) => {
        if (!m.channel) return true;
        const id = handleToStreamer.get(m.channel.toLowerCase());
        return !id || !hidden.has(id);
      });
    }
    if (focusAuthor) {
      const f = focusAuthor.toLowerCase();
      out = out.filter((m) => m.author.toLowerCase() === f);
    }
    return out;
  }, [filtered, mergeAll, hiddenIds, handleToStreamer, focusAuthor]);

  const { displayed, queueDepth } = useReadHelper(base, readHelper);

  // New-activity dot on the Chat tab while it's in the background.
  const lastMsgId = messages.length > 0 ? messages[messages.length - 1].id : null;
  useEffect(() => {
    if (lastMsgId) markDockActivity("chat");
  }, [lastMsgId]);

  // Click a search result to jump the live feed to that message.
  const [jumpTo, setJumpTo] = useState<{ id: string; nonce: number } | null>(null);

  // Other panels (e.g. clicking a Hype Meter spike) can jump the feed too.
  useEffect(
    () =>
      subscribeChatJump((id) => {
        setQuery("");
        setJumpTo({ id, nonce: Date.now() });
      }),
    [],
  );

  // Other panels (e.g. Chat Roster) can set/clear the author focus remotely.
  useEffect(() => subscribeAuthorFocus((author) => setFocusAuthor(author)), []);

  // Clicking an author opens their user card (stats + history; focus lives inside the card).
  const { openUserCard, userCardElement } = useUserCard({
    messages: filtered,
    focusAuthor,
    setFocusAuthor: changeFocusAuthor,
  });

  const { onRowContextMenu, menuElement } = useChatRowMenu({
    focusAuthor,
    setFocusAuthor: changeFocusAuthor,
    onHideChannel: mergeAll ? (id) => (hiddenIds.includes(id) ? undefined : saveHidden([...hiddenIds, id])) : undefined,
  });

  // When searching, filter the full buffer (bypassing the read-helper throttle).
  const q = query.trim().toLowerCase();
  const shown = q ? base.filter((m) => matchesQuery(m, q)) : displayed;
  const emptyState = q
    ? { label: "No matches", subtext: `No messages match “${query.trim()}”` }
    : focusAuthor
      ? { label: "No messages yet", subtext: `Nothing from ${focusAuthor} in the buffer` }
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
        <header className="flex h-11 flex-none items-center gap-1.5 border-b border-hairline px-3">
          {/* Zoom stepper: one bordered pill, like the segmented controls everywhere else. */}
          <div className="flex h-8 items-center rounded-lg border border-hairline bg-overlay-weak p-0.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => zoom(-STEP)}
                    disabled={scale <= MIN_SCALE}
                    aria-label="Make chat smaller"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <ZoomOut className="size-3.5" />
                  </button>
                }
              />
              <TooltipContent>Make chat smaller</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setScale(DEFAULT_SCALE)}
                    disabled={scale === DEFAULT_SCALE}
                    aria-label="Reset chat zoom"
                    className={`min-w-[4ch] rounded-md px-1 py-1 text-center font-mono text-[0.64rem] tabular-nums transition-colors ${
                      scale === DEFAULT_SCALE
                        ? "text-muted-foreground/70"
                        : "text-foreground hover:bg-overlay-medium"
                    }`}
                  >
                    {Math.round(scale * 100)}%
                  </button>
                }
              />
              <TooltipContent>{scale === DEFAULT_SCALE ? "Chat zoom" : "Reset zoom to 120%"}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => zoom(STEP)}
                    disabled={scale >= MAX_SCALE}
                    aria-label="Make chat bigger"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  >
                    <ZoomIn className="size-3.5" />
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
                      ? "bg-accent-violet/12 text-accent-violet hover:bg-accent-violet/18"
                      : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground"
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
                      ? "bg-overlay-medium text-foreground hover:bg-overlay-strong"
                      : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground"
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

          {/* Per-channel visibility, only meaningful when merging more than one channel. */}
          {mergeAll && feedChannels.length > 1 ? (
            <ChannelFilter
              channels={feedChannels}
              hiddenIds={hiddenIds}
              onToggle={toggleChannel}
              onShowAll={() => saveHidden([])}
            />
          ) : null}

          <span className="ml-auto flex flex-none items-center gap-2 rounded-lg bg-overlay-weak px-2.5 py-1.5">
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

        {/* Full-width search — desktop only; on mobile it just eats vertical space. */}
        <div className="hidden flex-none border-b border-hairline px-2.5 py-2 md:block">
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-overlay-weak px-2.5 py-1.5 transition-colors focus-within:border-hairline-strong focus-within:bg-overlay-weak">
            <Search className="size-4 flex-none text-muted-foreground/70" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chat"
              aria-label="Search chat"
              className="min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/45 md:text-[0.82rem]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="flex size-5 flex-none items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-overlay-medium hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </TooltipProvider>

      {/* Author focus banner — click a username in chat to focus, click again or clear here. */}
      {focusAuthor ? (
        <div className="flex flex-none items-center gap-2 border-b border-hairline bg-feed-link/[0.07] px-3 py-1.5">
          <AtSign className="size-3.5 flex-none text-feed-link" />
          <span className="min-w-0 truncate text-[0.74rem] text-foreground/90">
            Focused on <b className="font-semibold">{focusAuthor}</b>
          </span>
          <button
            type="button"
            onClick={() => changeFocusAuthor(null)}
            aria-label="Clear author focus"
            className="ml-auto flex size-5 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <Feed
        messages={shown}
        showSource
        scale={scale}
        density={settings.density}
        showTimestamps={settings.showTimestamps}
        showDeleted={settings.showDeleted}
        readHelper={readHelper && !q}
        onAuthorClick={openUserCard}
        onRowContextMenu={onRowContextMenu}
        jumpTo={jumpTo}
        onRowClick={
          q
            ? (m) => {
                setQuery("");
                setJumpTo({ id: m.id, nonce: Date.now() });
              }
            : undefined
        }
        emptyIcon={MessagesSquare}
        emptyLabel={emptyState.label}
        emptySubtext={emptyState.subtext}
      />
      {menuElement}
      {userCardElement}
    </div>
  );
}

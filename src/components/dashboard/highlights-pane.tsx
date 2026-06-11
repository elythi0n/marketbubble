"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Flame, Trash2 } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { requestChatJump } from "@/lib/chat-jump";
import { hasDock, openPanel } from "@/lib/dock-api";
import {
  clearHighlights,
  getHighlights,
  highlightsVersion,
  subscribeHighlights,
  type Highlight,
} from "@/lib/highlights-store";

function timeAgo(tsMs: number, nowMs: number): string {
  const diffMs = nowMs - tsMs;
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m ago` : `${hrs}h ago`;
}

function jumpToHighlight(h: Highlight) {
  if (!h.anchorMsgId) return;
  if (hasDock()) openPanel("chat", "Chat");
  setTimeout(() => requestChatJump(h.anchorMsgId!), 60);
}

function HighlightCard({ h, nowMs }: { h: Highlight; nowMs: number }) {
  const canJump = !!h.anchorMsgId;
  return (
    <div className="border-b border-white/[0.05] px-3 py-3 last:border-b-0">
      {/* Spike stats row */}
      <div className="mb-2 flex items-center gap-2">
        <Flame className="size-3.5 flex-none text-[#ef6a61]" />
        <span className="font-mono text-[0.78rem] font-bold text-[#ef6a61]">
          {h.ratio.toFixed(1)}×
        </span>
        <span className="text-[0.72rem] text-muted-foreground">
          {h.mpm}/min
        </span>
        <span className="ml-auto font-mono text-[0.68rem] tabular-nums text-muted-foreground/60">
          {timeAgo(h.tsMs, nowMs)}
        </span>
      </div>

      {/* Excerpt messages */}
      {h.excerpts.length > 0 ? (
        <ul className="mb-2.5 flex flex-col gap-1">
          {h.excerpts.map((e, i) => (
            <li key={i} className="flex min-w-0 items-baseline gap-1.5">
              <PlatformGlyph platform={e.platform} className="size-2.5 flex-none translate-y-px text-muted-foreground/50" />
              <span
                className="flex-none text-[0.74rem] font-medium"
                style={e.color ? { color: e.color } : undefined}
              >
                {e.author}
              </span>
              <span className="min-w-0 truncate text-[0.72rem] text-muted-foreground/80">
                {e.text}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Jump action */}
      {canJump ? (
        <button
          type="button"
          onClick={() => jumpToHighlight(h)}
          className="text-[0.66rem] font-medium text-[#a8a8f8] transition-opacity hover:opacity-80"
        >
          Jump to chat →
        </button>
      ) : null}
    </div>
  );
}

/**
 * Browsable timeline of chat spikes recorded by HighlightsBridge.
 * Works even when this panel is closed — the bridge writes to the shared store continuously.
 */
export function HighlightsPane() {
  // Re-render whenever the store updates (the version number changes).
  useSyncExternalStore(subscribeHighlights, highlightsVersion, highlightsVersion);
  const highlights = getHighlights();

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <Flame className="size-4 text-muted-foreground" />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">
          Highlights
        </span>
        {highlights.length > 0 ? (
          <>
            <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
              {highlights.length}
            </span>
            <button
              type="button"
              title="Clear all highlights"
              onClick={clearHighlights}
              className="ml-auto flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        ) : null}
      </header>

      {highlights.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <Flame className="size-7 text-muted-foreground/30" />
          <span className="text-sm font-medium text-muted-foreground">No highlights yet</span>
          <span className="text-xs text-muted-foreground/60">
            Chat spikes are saved here automatically — no need to keep this panel open
          </span>
        </div>
      ) : (
        <ul className="mb-scroll flex-1 overflow-y-auto">
          {highlights.map((h) => (
            <li key={h.id}>
              <HighlightCard h={h} nowMs={nowMs} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

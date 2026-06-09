"use client";

import { useState } from "react";
import { Eye, MessagesSquare, ZoomIn, ZoomOut } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useReadHelper } from "@/hooks/use-read-helper";
import { useFeedContext } from "@/lib/chat/feed-context";
import type { ProviderStatus } from "@/lib/chat/provider";
import { PLATFORM_LABEL, PLATFORMS } from "@/lib/feed/types";

const MIN_SCALE = 0.8;
const MAX_SCALE = 1.6;
const STEP = 0.1;

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
  const [scale, setScale] = useState(1.2);
  const [readHelper, setReadHelper] = useState(false);

  const { displayed, queueDepth } = useReadHelper(messages, readHelper);
  const emptyState = chatEmptyState(statuses);

  const zoom = (delta: number) =>
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round((s + delta) * 10) / 10)));

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-2.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => zoom(-STEP)}
            disabled={scale <= MIN_SCALE}
            aria-label="Make chat smaller"
            title="Make chat smaller"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ZoomOut className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => zoom(STEP)}
            disabled={scale >= MAX_SCALE}
            aria-label="Make chat bigger"
            title="Make chat bigger"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:opacity-35 disabled:hover:bg-transparent"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <span className="ml-1 font-mono text-[0.62rem] tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
        </div>

        {/* Read helper toggle */}
        <button
          type="button"
          onClick={() => setReadHelper((v) => !v)}
          aria-pressed={readHelper}
          aria-label={readHelper ? "Turn off read helper" : "Turn on read helper"}
          title={
            readHelper
              ? "Read helper on — slowing chat for easier reading. Click to turn off."
              : "Read helper — slow down chat so it's easier to read"
          }
          className={`inline-flex h-6 items-center justify-center gap-1.5 rounded-md px-2 transition-colors ${
            readHelper
              ? "bg-white/[0.09] text-[#a8a8f8] hover:bg-white/[0.13]"
              : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground"
          }`}
        >
          <Eye className="size-3.5" />
          {readHelper && queueDepth > 0 ? (
            <span className="min-w-[1.4ch] font-mono text-[0.6rem] tabular-nums leading-none">
              {queueDepth > 99 ? "99+" : queueDepth}
            </span>
          ) : null}
        </button>

        <span className="ml-auto flex items-center gap-2">
          {PLATFORMS.map((platform) => {
            // Find the status for any provider whose id starts with the platform name.
            const status = Object.entries(statuses).find(([id]) => id.startsWith(platform))?.[1];
            const connected = status === "open";
            const hasProvider = status !== undefined;
            if (!hasProvider) return null;
            return (
              <span
                key={platform}
                className={`flex items-center transition-opacity ${connected ? "opacity-100" : "opacity-30"}`}
                title={`${PLATFORM_LABEL[platform]}: ${status ?? "no provider"}`}
              >
                <PlatformGlyph platform={platform} className="size-3.5" />
              </span>
            );
          })}
        </span>
      </header>

      <Feed
        messages={displayed}
        showSource
        scale={scale}
        readHelper={readHelper}
        emptyIcon={MessagesSquare}
        emptyLabel={emptyState.label}
        emptySubtext={emptyState.subtext}
      />
    </div>
  );
}

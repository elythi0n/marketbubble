"use client";

import { useEffect, useState } from "react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useChannel } from "@/lib/streamers/channel-context";
import { getHandle, type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, nextOccurrence } from "@/lib/streamers/schedule";
import { cn } from "@/lib/utils";
import { ChatPane } from "./chat-pane";
import { GiftsPane } from "./gifts-pane";
import { StreamPane } from "./stream-pane";
import { StreamerAvatar } from "./streamer-avatar";
import type { Platform } from "@/lib/feed/types";

function platformUrl(platform: Platform, streamer: Streamer): string {
  const handle = getHandle(streamer, platform);
  switch (platform) {
    case "twitch": return `https://twitch.tv/${handle}`;
    case "kick": return `https://kick.com/${handle}`;
    case "x": return `https://x.com/${handle}`;
  }
}

function MobileOfflineView({ channel }: { channel: Streamer }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const target = channel.schedule ? nextOccurrence(channel.schedule, now) : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0c0c0e] px-4 py-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(255,255,255,0.04),transparent_80%)]" />

      {/* Identity row: avatar · name/status · social links */}
      <div className="relative flex flex-none items-center gap-3">
        <StreamerAvatar streamer={channel} size={48} showLive={false} dim={false} />
        <div className="min-w-0 flex-1">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Offline</p>
          <p className="truncate text-[0.95rem] font-bold leading-tight text-foreground">{channel.name}</p>
        </div>
        <div className="flex items-center gap-1.5">
          {channel.platforms.map((p) => (
            <a
              key={p}
              href={platformUrl(p, channel)}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={`${channel.name} on ${p}`}
              className="flex size-8 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04] transition-colors active:bg-white/[0.08]"
            >
              <PlatformGlyph platform={p} className="size-3.5" />
            </a>
          ))}
        </div>
      </div>

      {/* Schedule — centered in remaining space */}
      {channel.schedule ? (
        <div className="relative flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <p className="text-[0.58rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Next stream</p>
          {target ? (
            <p className="font-mono text-[2.2rem] font-bold tabular-nums leading-none text-foreground">
              {formatCountdown(target.getTime() - now.getTime())}
            </p>
          ) : null}
          <p className="font-brand-wordmark mt-1 text-[1rem] uppercase tracking-[0.04em] text-foreground/80">
            {channel.schedule.label}
          </p>
          {target ? (
            <p className="mt-0.5 text-[0.62rem] text-muted-foreground/50">
              {target.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Mobile dashboard body: stream (or offline card) on top, then Chat/Gifts tabs below. */
export function MobileWorkspace() {
  const [tab, setTab] = useState<"chat" | "gifts">("chat");
  const { selectedId, streamers } = useChannel();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const offline = !channel.live;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex-none border-b border-white/[0.07]", offline ? "h-[36dvh]" : "h-[33dvh]")}>
        {offline ? <MobileOfflineView channel={channel} /> : <StreamPane />}
      </div>

      <div className="flex flex-none border-b border-white/[0.07] bg-card">
        {(["chat", "gifts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-[0.72rem] font-semibold uppercase tracking-[0.08em] transition-colors",
              tab === t ? "text-foreground shadow-[inset_0_-2px_0_0_var(--accent-strong)]" : "text-muted-foreground",
            )}
          >
            {t === "chat" ? "Chat" : "Gifts"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">{tab === "chat" ? <ChatPane /> : <GiftsPane />}</div>
    </div>
  );
}

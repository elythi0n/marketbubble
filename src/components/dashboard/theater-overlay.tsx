"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useFeedContext } from "@/lib/chat/feed-context";
import { useFilteredMessages } from "@/lib/settings/use-filtered-messages";
import { useChannel } from "@/lib/streamers/channel-context";
import { useViewMode } from "@/lib/stage-mode-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hasVideo, type Streamer } from "@/lib/streamers/mock";
import { PollCard } from "./poll-card";
import { StreamEmbed } from "./stream-pane";
import { StreamerAvatar } from "./streamer-avatar";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Theater: stream-dominant view. The player fills the canvas, a chat column runs down the right
 * edge, and everything else disappears. Cheap to render — reuses the same `StreamEmbed` so there's
 * still only one player instance on the page (stream-pane suppresses its embed while we're open).
 */
export function TheaterOverlay() {
  const { active, exit } = useViewMode();
  const { selectedId, streamers } = useChannel();
  const isMobile = useIsMobile();
  const channel: Streamer | undefined = streamers.find((s) => s.id === selectedId);
  const open = active === "theater" && !isMobile;

  // Stage has the same guard; Theater needs it too. Without it, narrowing to the mobile breakpoint
  // (or rotating a tablet) leaves `active === "theater"` set while this overlay refuses to render
  // — StreamPane then shows the "Playing in Theater" placeholder and the viewer has no video and
  // no visible exit. Auto-exit so the dashboard reverts cleanly.
  useEffect(() => {
    if (active === "theater" && isMobile) exit();
  }, [active, isMobile, exit]);

  // No AnimatePresence on purpose — its exit animation would keep the iframe mounted while a
  // sibling overlay (Stage/TV) mounts its own, producing ~300ms of double-audio every mode
  // switch. Conditional render unmounts the iframe in lockstep with `active`. The enter fade
  // still plays via `initial`/`animate`; we just skip the exit fade.
  if (!open || !channel) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="fixed inset-0 z-[60] grid grid-cols-[1fr_360px] bg-background"
    >
          <div className="relative flex min-w-0 flex-col">
            <Identity channel={channel} />
            {/* StreamEmbed's iframe is `flex-1 w-full` — it needs a flex column wrapper with
                min-h-0 so it can actually claim the remaining vertical space. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {hasVideo(channel) ? (
                <StreamEmbed channel={channel} platform={channel.livePlatforms?.[0]} />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">No video for this channel</div>
              )}
            </div>
            <CloseButton onClick={exit} />
          </div>
      <TheaterChat />
    </motion.div>
  );
}

function Identity({ channel }: { channel: Streamer }) {
  return (
    <div className="flex items-center gap-3 border-b border-hairline bg-background/85 px-4 py-2.5 backdrop-blur-md">
      <StreamerAvatar streamer={channel} size={36} showLive={false} dim={false} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-foreground">{channel.name}</span>
          <span className="flex shrink-0 items-center gap-1">
            {channel.platforms.map((p) => (
              <PlatformGlyph key={p} platform={p} className="size-3.5" />
            ))}
          </span>
          {channel.live ? (
            <span className="flex shrink-0 items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-feed-ok">
              <span className="size-1.5 rounded-full bg-feed-ok" style={{ boxShadow: "0 0 7px rgba(70,196,90,0.7)" }} />
              Live
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">{channel.title || (channel.live ? "Live now" : "Offline")}</p>
      </div>
    </div>
  );
}

function TheaterChat() {
  const { messages } = useFeedContext();
  const filtered = useFilteredMessages(messages);
  return (
    <aside className="flex min-w-0 flex-col border-l border-hairline bg-card">
      <header className="border-b border-hairline px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        Chat
      </header>
      {/* PollCard self-hides when no poll is active, so it just disappears between rounds. */}
      <div className="px-3 pt-3 empty:hidden">
        <PollCard variant="stage" />
      </div>
      <div className="min-h-0 flex-1">
        <Feed messages={filtered} density="compact" readHelper />
      </div>
    </aside>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Exit Theater"
      className="absolute right-4 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-background/70 text-foreground/80 backdrop-blur-md transition-colors hover:bg-background/90 hover:text-foreground"
    >
      <X className="size-4" />
    </button>
  );
}

"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useChannel } from "@/lib/streamers/channel-context";
import { useViewMode } from "@/lib/stage-mode-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { hasVideo, type Streamer } from "@/lib/streamers/mock";
import { PollCard } from "./poll-card";
import { StreamEmbed } from "./stream-pane";
import { StreamerAvatar } from "./streamer-avatar";

const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * TV: lean-back view. The player fills the canvas edge-to-edge with a thin floating identity strip
 * over the bottom — designed for casting to a TV or having a stream in the corner of a second
 * monitor with no other chrome competing for attention.
 */
export function TVOverlay() {
  const { active, exit } = useViewMode();
  const { selectedId, streamers } = useChannel();
  const isMobile = useIsMobile();
  const channel: Streamer | undefined = streamers.find((s) => s.id === selectedId);
  const open = active === "tv" && !isMobile;

  // Match Stage's mobile self-eject: without this, shrinking to mobile leaves `active="tv"` set
  // while this overlay refuses to render, and StreamPane shows the "Playing in TV" placeholder
  // — viewer sees a dead screen with no exit (the X button lives inside the unrendered overlay).
  useEffect(() => {
    if (active === "tv" && isMobile) exit();
  }, [active, isMobile, exit]);

  // No AnimatePresence on purpose — the exit fade would keep this iframe mounted while a sibling
  // overlay (Stage/Theater) mounts its own, producing ~300ms of double-audio on every mode switch.
  // Conditional render unmounts the iframe in lockstep with `active`; enter fade still plays.
  if (!open || !channel) return null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="fixed inset-0 z-[60] bg-black"
    >
          {/* StreamEmbed's iframe is `flex-1 w-full` — wrap it in a fullscreen flex column so it can
              actually claim the height (a plain `absolute inset-0` div is not a flex axis). */}
          <div className="absolute inset-0 flex flex-col">
            {hasVideo(channel) ? (
              <StreamEmbed channel={channel} platform={channel.livePlatforms?.[0]} />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">No video for this channel</div>
            )}
          </div>
          <FloatingIdentity channel={channel} />
          {/* Poll auto-shows when active and self-hides otherwise (the wrapper collapses via
              `empty:hidden`). Top-center keeps it out of the player chrome and the close button. */}
          <div className="pointer-events-none absolute inset-x-0 top-5 z-20 flex justify-center empty:hidden">
            <div className="pointer-events-auto w-[min(420px,calc(100vw-6rem))]">
              <PollCard variant="stage" />
            </div>
          </div>
          <button
            type="button"
            onClick={exit}
            aria-label="Exit TV"
            className="absolute right-4 top-4 z-20 flex size-10 items-center justify-center rounded-full bg-background/60 text-foreground/85 backdrop-blur-md transition-colors hover:bg-background/85 hover:text-foreground"
          >
        <X className="size-4" />
      </button>
    </motion.div>
  );
}

function FloatingIdentity({ channel }: { channel: Streamer }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-hairline bg-background/70 px-4 py-2.5 shadow-[var(--shadow-popover)] backdrop-blur-md">
        <StreamerAvatar streamer={channel} size={40} showLive={false} dim={false} />
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.95rem] font-semibold text-foreground">{channel.name}</span>
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
          <p className="mt-0.5 max-w-[60vw] truncate text-[0.72rem] text-muted-foreground">
            {channel.title || (channel.live ? "Live now" : "Offline")}
          </p>
        </div>
      </div>
    </div>
  );
}

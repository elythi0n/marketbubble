"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PanelLeftClose, PanelLeftOpen, Play } from "lucide-react";

const SIDEBAR_EASE = [0.22, 1, 0.36, 1] as const;

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useChannel } from "@/lib/streamers/channel-context";
import { hasVideo, primaryPlatform, type Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";
import { StreamerAvatar } from "./streamer-avatar";

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function statusText(s: Streamer): string {
  if (s.live) return hasVideo(s) ? `${formatViewers(s.viewers)} watching` : "Live thread";
  return s.schedule?.label ?? "Offline";
}

const SOCIALS = [
  { name: "Twitch", icon: "/social/twitch.svg", href: "https://www.twitch.tv/fazebanks" },
  { name: "X", icon: "/social/x-light.svg", href: "https://x.com/marketbubble" },
  { name: "TikTok", icon: "/social/tiktok-light.svg", href: "https://www.tiktok.com/@marketbubble" },
  {
    name: "Spotify",
    icon: "/social/spotify.svg",
    href: "https://open.spotify.com/show/00yWnJPE80LSBglGwCrjZI?si=c83ecda867e94be1",
  },
];

/** Expanded channel card with a stream thumbnail. */
function ChannelCard({ streamer, active, onSelect }: { streamer: Streamer; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group block w-full overflow-hidden rounded-lg border text-left transition-colors",
        active ? "border-white/20 bg-white/[0.05]" : "border-transparent hover:bg-white/[0.04]",
      )}
    >
      <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden bg-[#141416]", !streamer.live && "opacity-70")}>
        {streamer.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={streamer.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <PlatformGlyph platform={primaryPlatform(streamer)} className="size-8 opacity-[0.08]" tinted={false} />
        )}
        {streamer.live ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-[#46c45a]/18 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-wide text-[#46c45a]">
            <span className="size-1 rounded-full bg-[#46c45a]" />
            Live
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded bg-black/45 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-wide text-muted-foreground">
            Offline
          </span>
        )}
        {streamer.live && hasVideo(streamer) ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[0.8rem] font-semibold tabular-nums text-foreground">
            <span className="size-1.5 rounded-full bg-[#ef6a61]" />
            {formatViewers(streamer.viewers)}
          </span>
        ) : null}
        {streamer.live ? (
          <span className="absolute flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-3.5 translate-x-px fill-foreground text-foreground" />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-2 py-2">
        <StreamerAvatar streamer={streamer} size={22} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-[0.82rem] font-medium", streamer.live ? "text-foreground" : "text-muted-foreground")}>
              {streamer.name}
            </span>
            <span className="flex shrink-0 items-center gap-1">
              {streamer.platforms.map((p) => (
                <PlatformGlyph key={p} platform={p} className="size-3" />
              ))}
            </span>
          </span>
          <span className="truncate text-[0.68rem] text-muted-foreground">{statusText(streamer)}</span>
        </div>
      </div>
    </button>
  );
}

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const { selectedId, select, streamers } = useChannel();

  const sorted = [...streamers].sort((a, b) => Number(b.live) - Number(a.live) || b.viewers - a.viewers);

  return (
    <motion.aside
      layout
      transition={{ layout: { duration: 0.32, ease: SIDEBAR_EASE } }}
      onClick={() => {
        if (!expanded) setExpanded(true);
      }}
      className={cn(
        "relative z-20 flex flex-none flex-col border-r border-white/[0.07] bg-[#161619]",
        expanded ? "w-64" : "w-14 cursor-pointer",
      )}
    >
      <div className={cn("flex h-11 flex-none items-center border-b border-white/[0.06]", expanded ? "px-3" : "justify-center")}>
        {expanded ? (
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Channels</span>
        ) : null}
        <button
          type="button"
          aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={cn(
            "flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
            expanded ? "ml-auto" : "",
          )}
        >
          {expanded ? <PanelLeftClose className="size-[18px]" /> : <PanelLeftOpen className="size-[18px]" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 mb-scroll">
        {expanded ? (
          <ul className="flex flex-col gap-2.5">
            {sorted.map((streamer) => (
              <li key={streamer.id}>
                <ChannelCard streamer={streamer} active={streamer.id === selectedId} onSelect={() => select(streamer.id)} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((streamer) => {
              const active = streamer.id === selectedId;
              return (
                <li key={streamer.id}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      select(streamer.id);
                    }}
                    title={`${streamer.name} · ${statusText(streamer)}`}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "group relative flex w-full items-center justify-center rounded-lg p-0.5 transition-colors",
                      active ? "bg-white/[0.08]" : "hover:bg-white/[0.05]",
                    )}
                  >
                    {active ? (
                      <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-[#e4e4e4]" aria-hidden />
                    ) : null}
                    <StreamerAvatar streamer={streamer} size={38} rounded="lg" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Social links: a wrapping row that flows to a column when collapsed, animating with the
          sidebar width. Icons are muted/grayscale together and light up to brand color on hover. */}
      <div className="flex-none border-t border-white/[0.06] p-2.5" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap content-center justify-center gap-1">
          {SOCIALS.map((s) => (
            <motion.a
              key={s.name}
              layout="position"
              transition={{ duration: 0.32, ease: SIDEBAR_EASE }}
              href={s.href}
              target="_blank"
              rel="noreferrer noopener"
              title={s.name}
              aria-label={s.name}
              className="group flex items-center justify-center rounded-md p-2 transition-colors hover:bg-white/[0.06]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.icon}
                alt={s.name}
                className="size-[18px] opacity-65 transition-opacity duration-150 group-hover:opacity-100"
              />
            </motion.a>
          ))}
        </div>
      </div>
    </motion.aside>
  );
}

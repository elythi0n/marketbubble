"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { MessagesSquare, MonitorPlay, PanelLeftClose, PanelLeftOpen, Pin, Play } from "lucide-react";

const SIDEBAR_EASE = [0.22, 1, 0.36, 1] as const;

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { ContextMenu, type MenuEntry } from "@/components/ui/context-menu";
import { hasDock, openChannelChat } from "@/lib/dock-api";
import { PLATFORM_LABEL } from "@/lib/feed/types";
import { useChannel } from "@/lib/streamers/channel-context";
import { hasVideo, type Streamer } from "@/lib/streamers/mock";
import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";
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

/** Thumbnail + identity layout shared by the expanded card and the collapsed hover preview. */
function ChannelCardBody({ streamer, hover = true }: { streamer: Streamer; hover?: boolean }) {
  return (
    <>
      <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden bg-[#141416]", !streamer.live && "opacity-70")}>
        {streamer.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={streamer.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MarketBubbleLogo className="size-12 text-foreground opacity-[0.08]" />
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
        {hover && streamer.live ? (
          <span className="absolute flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-3.5 translate-x-px fill-foreground text-foreground" />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-2 py-2">
        <StreamerAvatar streamer={streamer} size={22} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1.5">
            {streamer.pinned ? <Pin className="size-3 shrink-0 fill-current text-[#d8b25a]" aria-label="Pinned" /> : null}
            <span className={cn("truncate text-[0.82rem] font-medium", streamer.live ? "text-foreground" : "text-muted-foreground")}>
              {streamer.name}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {streamer.platforms.map((p) => {
                const count = streamer.live ? streamer.viewersByPlatform?.[p] : undefined;
                return (
                  <span key={p} className="flex items-center gap-0.5">
                    <PlatformGlyph platform={p} className="size-3" />
                    {count !== undefined ? (
                      <span className="font-mono text-[0.6rem] tabular-nums text-muted-foreground">
                        {formatViewers(count)}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </span>
          </span>
          <span className="truncate text-[0.68rem] text-muted-foreground">
            {streamer.live && streamer.title ? streamer.title : statusText(streamer)}
          </span>
        </div>
      </div>
    </>
  );
}

/** Expanded channel card with a stream thumbnail. */
function ChannelCard({
  streamer,
  active,
  onSelect,
  onContextMenu,
}: {
  streamer: Streamer;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onContextMenu={onContextMenu}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group block w-full overflow-hidden rounded-lg border text-left transition-colors",
        active ? "border-white/20 bg-white/[0.05]"
        : streamer.pinned ? "border-[#d8b25a]/25 bg-[#d8b25a]/[0.03] hover:bg-[#d8b25a]/[0.06]"
        : "border-transparent hover:bg-white/[0.04]",
      )}
    >
      <ChannelCardBody streamer={streamer} />
    </button>
  );
}

/** Collapsed avatar button that reveals a full preview card (thumbnail + title) on hover. */
function CollapsedStreamerButton({
  streamer,
  active,
  onSelect,
  onContextMenu,
}: {
  streamer: Streamer;
  active: boolean;
  onSelect: () => void;
  onContextMenu: (e: ReactMouseEvent) => void;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onContextMenu={onContextMenu}
        onMouseEnter={(e) => setRect(e.currentTarget.getBoundingClientRect())}
        onMouseLeave={() => setRect(null)}
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
        {streamer.pinned ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-[#d8b25a]/40 bg-[#26221a]"
            aria-label="Pinned"
          >
            <Pin className="size-2.5 fill-current text-[#d8b25a]" />
          </span>
        ) : null}
      </button>

      {rect
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[120] w-[248px] overflow-hidden rounded-lg border border-white/12 bg-[#1b1b1f] shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
              style={{
                left: rect.right + 10,
                top: Math.min(rect.top - 6, window.innerHeight - 210),
              }}
            >
              <ChannelCardBody streamer={streamer} hover={false} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

export function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const { selectedId, select, streamers } = useChannel();
  const [menu, setMenu] = useState<{ x: number; y: number; streamer: Streamer } | null>(null);

  // Pinned channels (set by the operator) lead, then live before offline, then by viewers.
  const sorted = [...streamers].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || Number(b.live) - Number(a.live) || b.viewers - a.viewers,
  );

  const openMenu = (streamer: Streamer) => (e: ReactMouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, streamer });
  };

  let menuEntries: MenuEntry[] = [];
  if (menu) {
    const s = menu.streamer;
    menuEntries = [
      { type: "heading", label: s.name },
      { label: "Watch channel", icon: MonitorPlay, onSelect: () => select(s.id) },
    ];
    if (hasDock() && (s.handles.twitch || s.handles.kick)) {
      menuEntries.push({ label: "Open chat panel", icon: MessagesSquare, onSelect: () => openChannelChat(s) });
      for (const p of ["twitch", "kick"] as const) {
        if (s.handles[p]) {
          menuEntries.push({
            label: `Open ${PLATFORM_LABEL[p]} chat only`,
            icon: MessagesSquare,
            onSelect: () => openChannelChat(s, p),
          });
        }
      }
    }
  }

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
                <ChannelCard
                  streamer={streamer}
                  active={streamer.id === selectedId}
                  onSelect={() => select(streamer.id)}
                  onContextMenu={openMenu(streamer)}
                />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((streamer) => (
              <li key={streamer.id}>
                <CollapsedStreamerButton
                  streamer={streamer}
                  active={streamer.id === selectedId}
                  onSelect={() => select(streamer.id)}
                  onContextMenu={openMenu(streamer)}
                />
              </li>
            ))}
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

      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} /> : null}
    </motion.aside>
  );
}

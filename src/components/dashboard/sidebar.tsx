"use client";

import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { Clapperboard, Copy, MessagesSquare, MonitorPlay, PanelLeftClose, PanelLeftOpen, Pin, Play } from "lucide-react";

const SIDEBAR_EASE = [0.22, 1, 0.36, 1] as const;

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { SpotifyIcon, TikTokIcon, TwitchIcon, XIcon } from "@/components/social-icons";
import { ContextMenu, type MenuEntry } from "@/components/ui/context-menu";
import { hasDock, openChannelChat } from "@/lib/dock-api";
import { PLATFORM_LABEL } from "@/lib/feed/types";
import { useChannel } from "@/lib/streamers/channel-context";
import { hasVideo, type Streamer } from "@/lib/streamers/mock";
import { isStarting } from "@/lib/streamers/schedule";
import { cn } from "@/lib/utils";
import { MarketBubbleLogo } from "./market-bubble-logo";
import { StreamerAvatar } from "./streamer-avatar";

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function statusText(s: Streamer): string {
  if (s.live) return `${formatViewers(s.viewers)} watching`;
  if (s.schedule && isStarting(s.schedule, new Date())) return "Show is starting…";
  return s.schedule?.label ?? "Offline";
}

const SOCIALS = [
  { name: "Twitch", Icon: TwitchIcon, href: "https://www.twitch.tv/fazebanks" },
  { name: "X", Icon: XIcon, href: "https://x.com/marketbubble" },
  { name: "TikTok", Icon: TikTokIcon, href: "https://www.tiktok.com/@marketbubble" },
  {
    name: "Spotify",
    Icon: SpotifyIcon,
    href: "https://open.spotify.com/show/00yWnJPE80LSBglGwCrjZI?si=c83ecda867e94be1",
  },
];

/** Thumbnail + identity layout shared by the expanded card and the collapsed hover preview. */
function ChannelCardBody({ streamer, hover = true }: { streamer: Streamer; hover?: boolean }) {
  return (
    <>
      <div className={cn("relative flex aspect-video items-center justify-center overflow-hidden bg-background", !streamer.live && "opacity-70")}>
        {streamer.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={streamer.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <MarketBubbleLogo className="size-12 text-foreground opacity-[0.08]" />
        )}
        {streamer.live ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-feed-ok/18 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-wide text-feed-ok">
            <span className="size-1 rounded-full bg-feed-ok" />
            Live
          </span>
        ) : streamer.schedule && isStarting(streamer.schedule, new Date()) ? (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-feed-ok/18 px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-wide text-feed-ok">
            <span className="size-1 animate-pulse rounded-full bg-feed-ok" />
            Starting
          </span>
        ) : (
          <span className="absolute left-2 top-2 rounded bg-overlay-strong px-1.5 py-0.5 text-[0.56rem] font-bold uppercase tracking-wide text-muted-foreground">
            Offline
          </span>
        )}
        {streamer.live ? (
          <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[0.8rem] font-semibold tabular-nums text-white">
            <span className="size-1.5 rounded-full bg-feed-danger" />
            {formatViewers(streamer.viewers)}
          </span>
        ) : null}
        {hover && streamer.live && hasVideo(streamer) ? (
          // Hover play overlays a live thumbnail (always a dark video frame), so the pill stays
          // fixed white/black regardless of theme.
          <span className="absolute flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-3.5 translate-x-px fill-white text-white" />
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 px-2 py-2">
        <StreamerAvatar streamer={streamer} size={22} />
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="flex items-center gap-1.5">
            {streamer.pinned ? <Pin className="size-3 shrink-0 fill-current text-feed-warn" aria-label="Pinned" /> : null}
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
        // Pinned keeps its golden frame even while selected — being the active channel
        // shouldn't hide that the operator pinned it.
        streamer.pinned && active
          ? "border-feed-warn/60 bg-feed-warn/[0.07] shadow-[var(--shadow-glow-warn)]"
          : streamer.pinned
            ? "border-feed-warn/40 bg-feed-warn/[0.04] shadow-[var(--shadow-glow-warn)] hover:bg-feed-warn/[0.08]"
            : active
              ? "border-hairline-strong bg-overlay-weak"
              : "border-transparent hover:bg-overlay-weak",
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
          active ? "bg-overlay-medium" : "hover:bg-overlay-weak",
          streamer.pinned && "ring-1 ring-inset ring-feed-warn/45",
        )}
      >
        {active ? (
          <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-foreground" aria-hidden />
        ) : null}
        <StreamerAvatar streamer={streamer} size={38} rounded="lg" />
        {streamer.pinned ? (
          <span
            className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full border border-feed-warn/40 bg-secondary"
            aria-label="Pinned"
          >
            <Pin className="size-2.5 fill-current text-feed-warn" />
          </span>
        ) : null}
      </button>

      {rect
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[120] w-[248px] overflow-hidden rounded-lg border border-hairline-strong bg-popover shadow-[var(--shadow-card)]"
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
  const { selectedId, select, streamers, polled } = useChannel();
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
    menuEntries.push(
      { type: "separator" },
      {
        label: "Open OBS overlay",
        icon: Clapperboard,
        onSelect: () => window.open(`/overlay?channel=${s.id}`, "_blank", "noopener"),
      },
      {
        label: "Copy OBS overlay URL",
        icon: Copy,
        onSelect: () => {
          navigator.clipboard
            ?.writeText(`${window.location.origin}/overlay?channel=${s.id}&bg=transparent`)
            .catch(() => {});
        },
      },
    );
  }

  return (
    <motion.aside
      layout
      transition={{ layout: { duration: 0.32, ease: SIDEBAR_EASE } }}
      onClick={() => {
        if (!expanded) setExpanded(true);
      }}
      className={cn(
        "relative z-20 flex flex-none flex-col border-r border-hairline bg-sidebar",
        expanded ? "w-64" : "w-14 cursor-pointer",
      )}
    >
      <div className={cn("flex h-11 flex-none items-center border-b border-hairline", expanded ? "px-3" : "justify-center")}>
        {expanded ? (
          <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {polled ? "Channels" : "Checking who's live…"}
          </span>
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

      {/* Until the first live-status poll lands, the list shimmers instead of flashing all-offline. */}
      <div className={cn("flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 mb-scroll", !polled && "animate-pulse")}>
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
      <div className="flex-none border-t border-hairline p-2.5" onClick={(e) => e.stopPropagation()}>
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
              className="group flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-overlay-weak hover:text-foreground"
            >
              <s.Icon className="size-[18px]" />
            </motion.a>
          ))}
        </div>
      </div>

      {menu ? <ContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={() => setMenu(null)} /> : null}
    </motion.aside>
  );
}

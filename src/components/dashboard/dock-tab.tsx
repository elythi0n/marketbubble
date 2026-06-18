"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Activity,
  AtSign,
  BarChart3,
  BookMarked,
  Building2,
  CalendarDays,
  CandlestickChart,
  CircleDollarSign,
  Droplets,
  Flame,
  Gauge,
  Gift,
  Inbox,
  LayoutGrid,
  MessagesSquare,
  MonitorPlay,
  Newspaper,
  Settings2,
  Brain,
  SlidersHorizontal,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";
import { Clapperboard, Copy } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { ContextMenu } from "@/components/ui/context-menu";
import { clearDockActivity, dockActivityVersion, hasDockActivity, subscribeDockActivity } from "@/lib/dock-activity";

// The core panels are permanent; everything the user adds from the launcher can be closed.
const FIXED = new Set(["stream", "chat", "gifts"]);

const ICONS: Record<string, LucideIcon> = {
  stream: MonitorPlay,
  chat: MessagesSquare,
  gifts: Gift,
  markets: BarChart3,
  news: Newspaper,
  predictions: TrendingUp,
  mentions: AtSign,
  inbox: Inbox,
  hype: Activity,
  highlights: Flame,
  trends: CircleDollarSign,
  chatters: Users,
  hyperliquid: Droplets,
  settings: Settings2,
  assistant: Brain,
  // markets page panels
  chart: CandlestickChart,
  watchlist: BookMarked,
  movers: TrendingUp,
  feargreed: Gauge,
  heatmapCrypto: LayoutGrid,
  heatmapStock: Building2,
  screener: SlidersHorizontal,
  calendar: CalendarDays,
  tagauge: Activity,
};

/** Tab leading icon: known panels get their lucide icon; platform-scoped chats their platform glyph. */
function TabIcon({ id }: { id: string }) {
  if (id.endsWith("-twitch")) return <PlatformGlyph platform="twitch" className="mb-dock-tab-icon" />;
  if (id.endsWith("-kick")) return <PlatformGlyph platform="kick" className="mb-dock-tab-icon" />;
  const Icon = ICONS[id] ?? (id.startsWith("chat-") ? MessagesSquare : null);
  return Icon ? <Icon className="mb-dock-tab-icon" /> : null;
}

/** OBS overlay route for a chat tab: the unified feed, or one channel's chat panel. */
function overlayPath(id: string): string | null {
  if (id === "chat") return "/overlay";
  const m = /^chat-(.+?)(?:-(?:twitch|kick))?$/.exec(id);
  return m ? `/overlay?channel=${m[1]}` : null;
}

export function DockTab(props: IDockviewPanelHeaderProps) {
  const closable = !FIXED.has(props.api.id);
  const overlay = overlayPath(props.api.id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Activity dot: shown while this panel has unseen content and is a background tab.
  const [isActive, setIsActive] = useState(props.api.isActive);
  useEffect(() => {
    const sub = props.api.onDidActiveChange((e) => {
      setIsActive(e.isActive);
      clearDockActivity(props.api.id);
    });
    return () => sub.dispose();
  }, [props.api]);
  useSyncExternalStore(subscribeDockActivity, dockActivityVersion, dockActivityVersion);
  const showDot = !isActive && hasDockActivity(props.api.id);

  return (
    <div
      className="mb-dock-tab"
      onMouseDown={(e) => {
        if (e.button === 1 && closable) {
          e.preventDefault();
          props.api.close();
        }
      }}
      onContextMenu={
        overlay
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenu({ x: e.clientX, y: e.clientY });
            }
          : undefined
      }
    >
      <TabIcon id={props.api.id} />
      <span>{props.api.title}</span>
      {showDot ? <span className="mb-dock-tab-dot" aria-label="New activity" /> : null}
      {closable ? (
        <button
          type="button"
          aria-label={`Close ${props.api.title}`}
          className="mb-dock-tab-close"
          onClick={(e) => {
            e.preventDefault();
            props.api.close();
          }}
        >
          <X className="size-3" />
        </button>
      ) : null}
      {menu && overlay ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { type: "heading", label: props.api.title ?? "Chat" },
            {
              label: "Open OBS overlay",
              icon: Clapperboard,
              onSelect: () => window.open(overlay, "_blank", "noopener"),
            },
            {
              label: "Copy OBS overlay URL",
              icon: Copy,
              onSelect: () => {
                const sep = overlay.includes("?") ? "&" : "?";
                navigator.clipboard?.writeText(`${window.location.origin}${overlay}${sep}bg=transparent`).catch(() => {});
              },
            },
          ]}
        />
      ) : null}
    </div>
  );
}

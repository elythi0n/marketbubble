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
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
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
  assistant: Sparkles,
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

export function DockTab(props: IDockviewPanelHeaderProps) {
  const closable = !FIXED.has(props.api.id);

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
    </div>
  );
}

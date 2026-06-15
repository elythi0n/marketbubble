"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  BookMarked,
  Building2,
  CalendarDays,
  CandlestickChart,
  ExternalLink,
  Gauge,
  LayoutGrid,
  Newspaper,
  Plus,
  SlidersHorizontal,
  TrendingUp,
  Vote,
  Zap,
} from "lucide-react";
import type { IDockviewHeaderActionsProps } from "dockview";

import { cn } from "@/lib/utils";

interface PanelEntry {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

const SECTIONS: ReadonlyArray<{ label: string; items: PanelEntry[] }> = [
  {
    label: "Charts",
    items: [
      { id: "chart", title: "Chart", icon: CandlestickChart },
      { id: "heatmapCrypto", title: "Crypto Heatmap", icon: LayoutGrid },
      { id: "heatmapStock", title: "Stock Heatmap", icon: Building2 },
    ],
  },
  {
    label: "Data",
    items: [
      { id: "watchlist", title: "Watchlist", icon: BookMarked },
      { id: "screener", title: "Screener", icon: SlidersHorizontal },
      { id: "movers", title: "Movers", icon: TrendingUp },
      { id: "calendar", title: "Calendar", icon: CalendarDays },
    ],
  },
  {
    label: "Sentiment",
    items: [
      { id: "feargreed", title: "Fear & Greed", icon: Gauge },
      { id: "tagauge", title: "Signals", icon: Activity },
    ],
  },
  {
    label: "Feed",
    items: [
      { id: "news", title: "Market News", icon: Newspaper },
      { id: "predictions", title: "Predictions", icon: Vote },
      { id: "hyperliquid", title: "Hyperliquid", icon: Zap },
    ],
  },
];

/** Markets board header controls: a widget launcher (grouped + icons) and pop-out. */
export function MarketHeaderActions({ containerApi, group }: IDockviewHeaderActionsProps) {
  const [open, setOpen] = useState(false);

  const add = (id: string, title: string) => {
    const existing = containerApi.getPanel(id);
    if (existing) existing.api.setActive();
    else containerApi.addPanel({ id, component: id, title, position: { referenceGroup: group, direction: "within" } });
    setOpen(false);
  };

  return (
    <div className="flex h-full items-center gap-2.5 px-2.5">
      <button
        type="button"
        title="Pop out into its own window"
        aria-label="Pop out"
        onClick={() => {
          try {
            containerApi.addPopoutGroup(group);
          } catch {
            /* popup blocked */
          }
        }}
        className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-[17px]" />
      </button>

      <div className="relative flex items-center">
        <button
          type="button"
          title="Add widget"
          aria-label="Add widget"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-[19px]" />
        </button>
        {open ? (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full z-[100] mt-1.5 w-52 rounded-lg border border-hairline-strong bg-popover p-1 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.85)]">
              {SECTIONS.map((section, i) => (
                <div key={section.label} className={i > 0 ? "mt-1 border-t border-hairline pt-1" : undefined}>
                  <p className="px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    {section.label}
                  </p>
                  {section.items.map((item) => {
                    const opened = !!containerApi.getPanel(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => add(item.id, item.title)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.82rem] text-foreground/90 transition-colors hover:bg-overlay-medium hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-3.5 flex-none text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {opened ? (
                          <span className="size-1 flex-none rounded-full bg-feed-ok" title="Already open" aria-label="Already open" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

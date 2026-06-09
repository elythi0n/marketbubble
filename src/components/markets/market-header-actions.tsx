"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import type { IDockviewHeaderActionsProps } from "dockview";

const ADDABLE = [
  { id: "chart", component: "chart", title: "Chart" },
  { id: "watchlist", component: "watchlist", title: "Watchlist" },
  { id: "movers", component: "movers", title: "Movers" },
  { id: "feargreed", component: "feargreed", title: "Fear & Greed" },
  { id: "heatmapCrypto", component: "heatmapCrypto", title: "Crypto Heatmap" },
  { id: "heatmapStock", component: "heatmapStock", title: "Stock Heatmap" },
  { id: "screener", component: "screener", title: "Screener" },
  { id: "calendar", component: "calendar", title: "Calendar" },
  { id: "tagauge", component: "tagauge", title: "Signals" },
];

/** Markets board header controls: a widget launcher and pop-out. */
export function MarketHeaderActions({ containerApi, group }: IDockviewHeaderActionsProps) {
  const [open, setOpen] = useState(false);

  const add = (id: string, component: string, title: string) => {
    const existing = containerApi.getPanel(id);
    if (existing) existing.api.setActive();
    else containerApi.addPanel({ id, component, title, position: { referenceGroup: group, direction: "within" } });
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
            <div className="absolute right-0 top-full z-[100] mt-1.5 w-48 rounded-lg border border-white/12 bg-[#1b1b1f] p-1 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.85)]">
              <p className="px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add widget</p>
              {ADDABLE.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => add(a.id, a.component, a.title)}
                  className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-[0.82rem] text-foreground/90 transition-colors hover:bg-white/[0.07] hover:text-foreground"
                >
                  {a.title}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

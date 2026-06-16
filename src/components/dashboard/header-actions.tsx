"use client";

import { useState, type ComponentType } from "react";
import {
  Activity,
  AtSign,
  CircleDollarSign,
  Dices,
  Droplets,
  ExternalLink,
  Flame,
  Inbox,
  LineChart,
  Newspaper,
  Plus,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import type { IDockviewHeaderActionsProps } from "dockview";

import { AI_ENABLED } from "@/lib/assistant/config";
import { useControl } from "@/lib/control/client";

interface PanelEntry {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}

const SECTIONS: ReadonlyArray<{ label: string; items: PanelEntry[] }> = [
  {
    label: "Insights",
    items: [
      { id: "hype", title: "Hype Meter", icon: Activity },
      { id: "highlights", title: "Highlights", icon: Flame },
      { id: "trends", title: "Tickers in Chat", icon: CircleDollarSign },
      { id: "chatters", title: "Chat Roster", icon: Users },
      { id: "mentions", title: "X Mentions", icon: AtSign },
      { id: "inbox", title: "Mention Inbox", icon: Inbox },
    ],
  },
  {
    label: "Markets",
    items: [
      { id: "markets", title: "Markets", icon: LineChart },
      { id: "news", title: "Market News", icon: Newspaper },
      { id: "predictions", title: "Predictions", icon: Dices },
      { id: "hyperliquid", title: "Hyperliquid", icon: Droplets },
    ],
  },
  {
    label: "Workspace",
    items: [
      ...(AI_ENABLED ? [{ id: "assistant", title: "Assistant", icon: Sparkles }] : []),
      { id: "settings", title: "Settings", icon: Settings },
    ],
  },
];

/** Per-group header controls: add a panel (launcher) and pop the group out into its own window. */
export function HeaderActions({ containerApi, group }: IDockviewHeaderActionsProps) {
  const [open, setOpen] = useState(false);
  const { flags } = useControl();
  // Runtime feature flags (set from /admin) hide panels the operator turned off live.
  const visible = (id: string) =>
    (id !== "assistant" || flags.assistant !== false) && (id !== "predictions" || flags.predictions !== false);
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => visible(i.id)) })).filter(
    (s) => s.items.length > 0,
  );

  const add = (id: string, title: string) => {
    const existing = containerApi.getPanel(id);
    if (existing) existing.api.setActive();
    else containerApi.addPanel({ id, component: id, title, position: { referenceGroup: group, direction: "within" } });
    setOpen(false);
  };

  const popOut = () => {
    try {
      containerApi.addPopoutGroup(group);
    } catch {
      /* popup blocked — ignore */
    }
  };

  return (
    <div className="flex h-full items-center gap-2.5 px-2.5">
      <button
        type="button"
        title="Pop out into its own window"
        aria-label="Pop out"
        onClick={popOut}
        className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
      >
        <ExternalLink className="size-[17px]" />
      </button>

      <div className="relative flex items-center">
        <button
          type="button"
          title="Add panel"
          aria-label="Add panel"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <Plus className="size-[19px]" />
        </button>
        {open ? (
          <>
            <div className="fixed inset-0 z-[90]" onClick={() => setOpen(false)} aria-hidden />
            <div className="absolute right-0 top-full z-[100] mt-1.5 w-52 rounded-lg border border-hairline-strong bg-card p-1 shadow-[var(--shadow-popover)]">
              {sections.map((section, i) => (
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
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.82rem] text-foreground/90 transition-colors hover:bg-overlay-medium hover:text-foreground"
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

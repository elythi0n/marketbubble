"use client";

import { useState } from "react";
import { ExternalLink, Plus } from "lucide-react";
import type { IDockviewHeaderActionsProps } from "dockview";

import { AI_ENABLED } from "@/lib/assistant/config";
import { useControl } from "@/lib/control/client";

const ADDABLE = [
  { id: "markets", title: "Markets" },
  { id: "news", title: "Market News" },
  { id: "predictions", title: "Predictions" },
  { id: "mentions", title: "X Mentions" },
  { id: "inbox", title: "Mention Inbox" },
  { id: "hyperliquid", title: "Hyperliquid" },
  ...(AI_ENABLED ? [{ id: "assistant", title: "Assistant" }] : []),
  { id: "settings", title: "Settings" },
];

/** Per-group header controls: add a panel (launcher) and pop the group out into its own window. */
export function HeaderActions({ containerApi, group }: IDockviewHeaderActionsProps) {
  const [open, setOpen] = useState(false);
  const { flags } = useControl();
  // Runtime feature flags (set from /admin) hide panels the operator turned off live.
  const addable = ADDABLE.filter(
    (a) => (a.id !== "assistant" || flags.assistant !== false) && (a.id !== "predictions" || flags.predictions !== false),
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
            <div className="absolute right-0 top-full z-[100] mt-1.5 w-44 rounded-lg border border-white/12 bg-[#1b1b1f] p-1 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.85)]">
              <p className="px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add panel</p>
              {addable.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => add(a.id, a.title)}
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

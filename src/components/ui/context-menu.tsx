"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type MenuEntry =
  | { type?: "item"; label: string; icon?: LucideIcon; danger?: boolean; onSelect: () => void }
  | { type: "separator" }
  | { type: "heading"; label: string };

interface Props {
  x: number;
  y: number;
  entries: MenuEntry[];
  onClose: () => void;
}

/** Right-click menu at the cursor, clamped to the viewport. Closes on click-away or Escape. */
export function ContextMenu({ x, y, entries, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Although portaled to <body>, React bubbles these events up the component tree — without
  // stopPropagation a menu click would also fire ancestor handlers (e.g. the collapsed sidebar's
  // click-to-expand).
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[150]"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        aria-hidden
      />
      <div
        ref={ref}
        role="menu"
        style={pos}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="fixed z-[151] w-56 rounded-lg border border-hairline-strong bg-popover p-1 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.85)]"
      >
        {entries.map((entry, i) => {
          if (entry.type === "separator") {
            return <div key={i} className="mx-1 my-1 border-t border-hairline" aria-hidden />;
          }
          if (entry.type === "heading") {
            return (
              <p key={i} className="truncate px-2 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {entry.label}
              </p>
            );
          }
          const Icon = entry.icon;
          return (
            <button
              key={i}
              type="button"
              role="menuitem"
              onClick={() => {
                entry.onSelect();
                onClose();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.8rem] transition-colors hover:bg-overlay-medium",
                entry.danger ? "text-feed-danger hover:text-feed-danger" : "text-foreground/90 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className={cn("size-3.5 flex-none", entry.danger ? "" : "text-muted-foreground")} /> : null}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

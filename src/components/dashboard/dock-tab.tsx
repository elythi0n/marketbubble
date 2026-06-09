"use client";

import { X } from "lucide-react";
import type { IDockviewPanelHeaderProps } from "dockview";

// The core panels are permanent; everything the user adds from the launcher can be closed.
const FIXED = new Set(["stream", "chat", "gifts"]);

export function DockTab(props: IDockviewPanelHeaderProps) {
  const closable = !FIXED.has(props.api.id);
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
      <span>{props.api.title}</span>
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

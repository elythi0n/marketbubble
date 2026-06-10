"use client";

import { useState } from "react";
import { Megaphone, X } from "lucide-react";

import { useControl } from "@/lib/control/client";

/**
 * Slim show-announcement banner, set from the /admin board and pushed live over the shared
 * control stream. Dismissing hides that specific announcement (a new one re-appears).
 */
export function AnnouncementBanner() {
  const { announcement } = useControl();
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  if (!announcement || dismissedAt === announcement.setAt) return null;

  return (
    <div className="flex flex-none items-center gap-2.5 border-b border-[#d8b25a]/20 bg-[#d8b25a]/[0.08] px-4 py-1.5">
      <Megaphone className="size-3.5 flex-none text-[#d8b25a]" />
      <p className="min-w-0 flex-1 truncate text-[0.78rem] font-medium text-foreground/90">{announcement.message}</p>
      <button
        type="button"
        onClick={() => setDismissedAt(announcement.setAt)}
        aria-label="Dismiss announcement"
        className="flex size-5 flex-none items-center justify-center rounded text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

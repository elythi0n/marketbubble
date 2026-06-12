"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, Pin, Radio, X } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useFlag } from "@/lib/control/client";
import { DEMO_ENABLED, useDemoMode } from "@/lib/demo-mode-context";
import { useChannel } from "@/lib/streamers/channel-context";
import { hasVideo } from "@/lib/streamers/mock";
import { isStarting } from "@/lib/streamers/schedule";
import { cn } from "@/lib/utils";
import { StreamerAvatar } from "./streamer-avatar";

function formatViewers(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

/** Bottom sheet listing channels; slides up smoothly, drag-down or tap-backdrop to dismiss. */
export function StreamerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selectedId, select, streamers, polled } = useChannel();
  const { isDemo, toggle } = useDemoMode();
  const demoOn = useFlag("demo");
  // Pinned channels (set by the operator) lead, then live before offline, then by viewers.
  const sorted = [...streamers].sort(
    (a, b) => Number(b.pinned ?? false) - Number(a.pinned ?? false) || Number(b.live) - Number(a.live) || b.viewers - a.viewers,
  );

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[78dvh] flex-col rounded-t-2xl border-t border-white/10 bg-[#161619] pb-[env(safe-area-inset-bottom)]"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div className="flex flex-none items-center gap-2 px-4 pb-2 pt-3">
              <span className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden />
            </div>
            <div className="flex flex-none items-center gap-2 px-4 pb-2">
              <span className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {polled ? "Channels" : "Checking who's live…"}
              </span>

              {/* Mobile home of the Live/Demo switch (the top nav doesn't exist here). */}
              {DEMO_ENABLED && demoOn ? (
                <div className="ml-1 flex items-center gap-0.5 rounded-md border border-white/10 bg-white/[0.02] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isDemo) toggle();
                    }}
                    aria-pressed={!isDemo}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                      !isDemo ? "bg-white/[0.08] text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Radio className={cn("size-3", !isDemo && "text-[#46c45a]")} />
                    Live
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDemo) toggle();
                    }}
                    aria-pressed={isDemo}
                    className={cn(
                      "flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-[0.7rem] font-medium transition-colors",
                      isDemo ? "bg-white/[0.08] text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <Clapperboard className="size-3" />
                    Demo
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="ml-auto inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            {/* Until the first live-status poll lands, the list shimmers instead of flashing all-offline. */}
            <ul className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-4 mb-scroll", !polled && "animate-pulse")}>
              {sorted.map((s) => {
                const active = s.id === selectedId;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        select(s.id);
                        onClose();
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                        s.pinned && active
                          ? "border-[#d8b25a]/60 bg-[#d8b25a]/[0.07]"
                          : s.pinned
                            ? "border-[#d8b25a]/40 bg-[#d8b25a]/[0.04] hover:bg-[#d8b25a]/[0.08]"
                            : active
                              ? "border-white/20 bg-white/[0.06]"
                              : "border-transparent hover:bg-white/[0.04]",
                      )}
                    >
                      <StreamerAvatar streamer={s} size={40} rounded="lg" />
                      <div className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="flex items-center gap-1.5">
                          {s.pinned ? <Pin className="size-3 shrink-0 fill-current text-[#d8b25a]" aria-label="Pinned" /> : null}
                          <span className={cn("truncate text-[0.92rem] font-medium", s.live ? "text-foreground" : "text-muted-foreground")}>
                            {s.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            {s.platforms.map((p) => (
                              <PlatformGlyph key={p} platform={p} className="size-3" />
                            ))}
                          </span>
                        </span>
                        <span className="mt-0.5 truncate text-[0.72rem] text-muted-foreground">
                          {s.live
                            ? hasVideo(s)
                              ? `${formatViewers(s.viewers)} watching`
                              : "Live thread"
                            : s.schedule && isStarting(s.schedule, new Date())
                              ? "Show is starting…"
                              : (s.schedule?.label ?? "Offline")}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}

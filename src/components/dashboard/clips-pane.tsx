"use client";

import { useState } from "react";
import { Clapperboard, Play } from "lucide-react";

import { useChannel } from "@/lib/streamers/channel-context";
import type { Clip } from "@/lib/streamers/clips";
import { useClips } from "@/lib/streamers/use-clips";
import { ClipsDialog, ClipSourceIcon } from "./clips-dialog";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function ClipCard({ clip, onClick }: { clip: Clip; onClick: () => void }) {
  const { title, platform, duration, views, thumbnail } = clip;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl bg-overlay-weak text-left transition-colors active:bg-overlay-weak"
    >
      <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-background">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={title} className="absolute inset-0 h-full w-full object-cover opacity-90" />
        ) : (
          <ClipSourceIcon platform={platform} className="size-8 opacity-[0.08]" />
        )}
        {/* Overlays a clip thumbnail (video frame) — fixed white-on-black, theme-independent. */}
        <span className="absolute flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/40 opacity-0 transition-opacity group-active:opacity-100">
          <Play className="size-3.5 translate-x-px fill-white text-white" />
        </span>
        {duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.58rem] tabular-nums text-white/90">
            {duration}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1 px-2 py-2">
        <span className="line-clamp-2 text-[0.78rem] font-medium leading-snug text-foreground">{title}</span>
        <span className="flex items-center gap-1.5 text-[0.66rem] text-muted-foreground">
          <ClipSourceIcon platform={platform} className="size-3 flex-none" />
          {views > 0 ? `${formatCount(views)} views` : clip.channel}
        </span>
      </span>
    </button>
  );
}

/** Mobile tab: recent clips & broadcasts for the selected channel, opening into the shared player dialog. */
export function ClipsPane() {
  const { selectedId, streamers } = useChannel();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const { clips } = useClips(channel);
  const [dialogClip, setDialogClip] = useState<Clip | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-11 flex-none items-center gap-2 border-b border-hairline px-3">
        <Clapperboard className="size-4 text-muted-foreground" />
        <span className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-foreground">
          Recent broadcasts
        </span>
        <span className="ml-auto min-w-0 truncate text-[0.68rem] text-muted-foreground">{channel.name}</span>
      </header>

      {clips.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
          <Clapperboard className="size-7 text-muted-foreground/40" />
          <span className="text-sm font-medium text-muted-foreground">No clips yet</span>
          <span className="text-xs text-muted-foreground/60">
            Recent clips and broadcasts from {channel.name} appear here
          </span>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3 mb-scroll">
          <div className="grid grid-cols-2 gap-2.5">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} onClick={() => setDialogClip(clip)} />
            ))}
          </div>
        </div>
      )}

      <ClipsDialog
        clip={dialogClip}
        clips={clips}
        onClose={() => setDialogClip(null)}
        onSelect={(c) => setDialogClip(c)}
      />
    </div>
  );
}

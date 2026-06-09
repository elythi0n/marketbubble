"use client";

import { useEffect, useState } from "react";
import { ExternalLink, X, Play } from "lucide-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { Dialog, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import type { Clip, ClipSource } from "@/lib/streamers/clips";
import { cn } from "@/lib/utils";

// ─── Shared helpers ───────────────────────────────────────────────────────────

export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 17" className={className} aria-hidden fill="none">
      <path d="M23.5 2.6A3 3 0 0 0 21.4.5C19.5 0 12 0 12 0S4.5 0 2.6.5A3 3 0 0 0 .5 2.6C0 4.5 0 8.5 0 8.5s0 4 .5 5.9a3 3 0 0 0 2.1 2.1C4.5 17 12 17 12 17s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1C24 12.5 24 8.5 24 8.5s0-4-.5-5.9z" fill="#FF0000" />
      <path d="M9.5 12.1V4.9L16 8.5l-6.5 3.6z" fill="white" />
    </svg>
  );
}

export function ClipSourceIcon({ platform, className }: { platform: ClipSource; className?: string }) {
  if (platform === "youtube") return <YouTubeIcon className={className} />;
  return <PlatformGlyph platform={platform} className={className} />;
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function embedUrl(clip: Clip, hostname: string): string | null {
  if (clip.platform === "youtube") {
    return `https://www.youtube.com/embed/${clip.id}?autoplay=1&rel=0&modestbranding=1`;
  }
  if (clip.platform === "twitch") {
    // Full broadcasts (VODs) play through the video player; short clips use the clip embed.
    return clip.kind === "vod"
      ? `https://player.twitch.tv/?video=${clip.id}&parent=${hostname}&autoplay=true`
      : `https://clips.twitch.tv/embed?clip=${clip.id}&parent=${hostname}&autoplay=true`;
  }
  return null;
}

// ─── Right-panel clip row ─────────────────────────────────────────────────────

function ClipRow({ clip, active, onClick }: { clip: Clip; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full gap-2.5 border-b border-white/[0.04] p-2.5 text-left transition-colors",
        active ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
      )}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-[88px] flex-none overflow-hidden rounded-md bg-[#0c0c0e]">
        {clip.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnail} alt={clip.title} className="h-full w-full object-cover" />
        ) : (
          <ClipSourceIcon platform={clip.platform} className="absolute inset-0 m-auto size-5 opacity-10" />
        )}
        {!active && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
            <Play className="size-3.5 translate-x-px fill-white text-white" />
          </span>
        )}
        {clip.duration ? (
          <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-px font-mono text-[0.52rem] tabular-nums text-white/90">
            {clip.duration}
          </span>
        ) : null}
        {active && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <Play className="size-3.5 translate-x-px fill-white text-white" />
            </span>
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-2 text-[0.73rem] font-medium leading-snug", active ? "text-foreground" : "text-foreground/80")}>
          {clip.title}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-[0.63rem] text-muted-foreground">
          <ClipSourceIcon platform={clip.platform} className="size-2.5 shrink-0" />
          <span className="truncate">{clip.channel}</span>
        </div>
      </div>
    </button>
  );
}

// ─── Main dialog ──────────────────────────────────────────────────────────────

interface ClipsDialogProps {
  clip: Clip | null;
  clips: Clip[];
  onClose: () => void;
  onSelect: (clip: Clip) => void;
}

export function ClipsDialog({ clip, clips, onClose, onSelect }: ClipsDialogProps) {
  const [hostname, setHostname] = useState("localhost");
  useEffect(() => { setHostname(window.location.hostname); }, []);

  const embed = clip ? embedUrl(clip, hostname) : null;

  return (
    <Dialog open={!!clip} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogPortal>
        {/* Darker backdrop for the dark app */}
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />

        <DialogPrimitive.Popup className="fixed top-1/2 left-1/2 z-50 flex h-[88vh] w-[92vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#131315] shadow-2xl outline-none duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
          <DialogTitle className="sr-only">{clip?.title ?? "Clips"}</DialogTitle>

          {clip && (
            <>
              {/* ── Left: player fills full height, info pinned at bottom ── */}
              <div className="flex min-w-0 flex-1 flex-col">
                {/* Video expands to fill all available vertical space */}
                <div className="relative min-h-0 flex-1 bg-black">
                  {embed ? (
                    <iframe
                      key={clip.id}
                      src={embed}
                      className="absolute inset-0 h-full w-full border-0"
                      allow="autoplay; fullscreen"
                      allowFullScreen
                      title={clip.title}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      {clip.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={clip.thumbnail} alt={clip.title} className="absolute inset-0 h-full w-full object-cover opacity-25" />
                      )}
                      {clip.url && (
                        <a
                          href={clip.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="relative z-10 flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-5 py-2.5 text-sm font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-white/20"
                        >
                          <ExternalLink className="size-4" />
                          Watch on {clip.platform}
                        </a>
                      )}
                    </div>
                  )}
                </div>

                {/* Compact info strip pinned to bottom */}
                <div className="flex flex-none items-center justify-between gap-4 border-t border-white/[0.06] px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[0.88rem] font-semibold text-foreground">{clip.title}</h2>
                    <div className="mt-0.5 flex items-center gap-2 text-[0.7rem] text-muted-foreground">
                      <ClipSourceIcon platform={clip.platform} className="size-3.5 shrink-0" />
                      <span>{clip.channel}</span>
                      {clip.duration ? <><span className="opacity-40">·</span><span>{clip.duration}</span></> : null}
                      {clip.views > 0 ? <><span className="opacity-40">·</span><span>{formatCount(clip.views)} views</span></> : null}
                    </div>
                  </div>
                  {clip.url && (
                    <a
                      href={clip.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex flex-none items-center gap-1.5 text-[0.68rem] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                    >
                      <ExternalLink className="size-3" />
                      Open original
                    </a>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="w-px flex-none bg-white/[0.06]" />

              {/* ── Right: scrollable clips list ── */}
              <div className="flex w-[260px] flex-none flex-col">
                <div className="flex flex-none items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
                  <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Videos
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {clips.map((c) => (
                    <ClipRow
                      key={c.id}
                      clip={c}
                      active={c.id === clip.id}
                      onClick={() => onSelect(c)}
                    />
                  ))}
                  {clips.length === 0 && (
                    <p className="px-3 py-8 text-center text-[0.72rem] text-muted-foreground/40">No videos</p>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { ClipsDialog, ClipSourceIcon } from "./clips-dialog";
import { useDemoMode } from "@/lib/demo-mode-context";
import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice } from "@/lib/markets/types";
import { useChannel } from "@/lib/streamers/channel-context";
import type { Clip } from "@/lib/streamers/clips";
import { getHandle, hasVideo, primaryPlatform, type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, nextOccurrence } from "@/lib/streamers/schedule";
import { useClips } from "@/lib/streamers/use-clips";
import { StreamerAvatar } from "./streamer-avatar";

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function ClipCard({ clip, onClick }: { clip: Clip; onClick: () => void }) {
  const { title, channel, platform, duration, views, thumbnail } = clip;
  const meta = [views > 0 ? `${formatCount(views)} views` : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-[230px] shrink-0 flex-col overflow-hidden rounded-xl bg-white/[0.03] text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#141416]">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={title} className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        ) : (
          <ClipSourceIcon platform={platform} className="size-9 opacity-[0.08]" />
        )}
        <span className="absolute flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 translate-x-px fill-foreground text-foreground" />
        </span>
        {duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.62rem] tabular-nums text-foreground/90">
            {duration}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1.5 px-1 py-2.5">
        <span className="line-clamp-2 text-[0.86rem] font-medium leading-snug text-foreground">{title}</span>
        <span className="flex items-center gap-1.5 text-[0.72rem] text-muted-foreground">
          <ClipSourceIcon platform={platform} className="size-3" />
          {channel}{meta ? ` · ${meta}` : ""}
        </span>
      </span>
    </button>
  );
}

function OfflinePanel({ channel, target }: { channel: Streamer; target: Date | null }) {
  const [now, setNow] = useState(() => new Date());
  const [dialogClip, setDialogClip] = useState<Clip | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const tickers = useTickers();
  const trending = [...tickers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 6);
  const { clips } = useClips(channel);
  const { openStock } = useStockDrawer();

  return (
    <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8 mb-scroll">
      {/* Next stream — centered, prominent. */}
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[0.64rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Next stream</p>
        <h2 className="font-brand-wordmark mt-2.5 text-[2.15rem] uppercase leading-[1.05] tracking-[0.015em] text-foreground sm:text-[2.6rem]">
          {channel.schedule?.label ?? "Schedule TBA"}
        </h2>
        {target ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Goes live {target.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            {" · in "}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatCountdown(target.getTime() - now.getTime())}
            </span>
          </p>
        ) : null}
        <p className="mt-1.5 text-xs text-muted-foreground/80">{channel.name} is offline · catch up below while you wait</p>
      </div>

      {/* Recent clips / videos */}
      <section className="mx-auto mt-9 max-w-5xl">
        <h3 className="mb-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent clips</h3>
        <div className="flex gap-4 overflow-x-auto pb-1 mb-scroll">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} onClick={() => setDialogClip(clip)} />
          ))}
        </div>
      </section>

      <ClipsDialog
        clip={dialogClip}
        clips={clips}
        onClose={() => setDialogClip(null)}
        onSelect={(c) => setDialogClip(c)}
      />

      {/* Trending markets */}
      <section className="mx-auto mt-7 max-w-5xl">
        <div className="mb-3 flex items-center gap-3">
          <h3 className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Trending markets</h3>
          <a
            href="/markets"
            className="ml-auto text-[0.66rem] font-medium text-muted-foreground/70 underline-offset-2 hover:text-foreground hover:underline transition-colors"
          >
            Open markets →
          </a>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {trending.map((t) => {
            const up = t.changePct >= 0;
            return (
              <button
                key={t.symbol}
                type="button"
                onClick={() => openStock(t.symbol)}
                className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors hover:bg-white/[0.06]"
              >
                <div className="flex flex-col leading-tight">
                  <span className="font-mono text-[0.84rem] font-semibold text-foreground">{t.symbol}</span>
                  <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">{formatPrice(t.price)}</span>
                </div>
                <span className={`font-mono text-[0.78rem] font-medium tabular-nums ${up ? "text-[#46c45a]" : "text-[#ef6a61]"}`}>
                  {formatChange(t.changePct)}
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StreamEmbed({ channel }: { channel: Streamer }) {
  const platform = channel.livePlatform ?? primaryPlatform(channel);
  const [parent, setParent] = useState("localhost");

  useEffect(() => {
    setParent(window.location.hostname);
  }, []);

  if (platform === "kick") {
    const kickHandle = getHandle(channel, "kick");
    return (
      <iframe
        key={`kick-${kickHandle}`}
        src={`https://player.kick.com/${kickHandle}`}
        className="relative z-10 flex-1 w-full border-0"
        allow="autoplay; fullscreen"
        allowFullScreen
        title={`${channel.name} on Kick`}
      />
    );
  }

  const twitchHandle = getHandle(channel, "twitch");
  return (
    <iframe
      key={`twitch-${twitchHandle}-${parent}`}
      src={`https://player.twitch.tv/?channel=${twitchHandle}&parent=${parent}&muted=false`}
      className="relative z-10 flex-1 w-full border-0"
      allow="autoplay; fullscreen"
      allowFullScreen
      title={`${channel.name} on Twitch`}
    />
  );
}

/**
 * Center stage. Reflects the channel selected in the sidebar: a player placeholder when live, or a
 * featured-content panel (next-stream schedule + clips + trending markets) when offline.
 */
export function StreamPane() {
  const { selectedId, streamers } = useChannel();
  const { isDemo } = useDemoMode();
  const channel: Streamer = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const offline = isDemo ? false : !channel.live;
  const target = channel.schedule ? nextOccurrence(channel.schedule, new Date()) : null;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#0c0c0e]">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.05),transparent_60%)]" />
      {!offline ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05]">
          <PlatformGlyph platform={channel.livePlatform ?? primaryPlatform(channel)} className="size-64" tinted={false} />
        </div>
      ) : null}

      {/* Top identity bar */}
      <div className="relative z-10 flex items-center gap-3 p-3">
        <StreamerAvatar streamer={channel} size={36} showLive={false} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{channel.name}</span>
            <span className="flex items-center gap-1">
              {channel.platforms.map((p) => (
                <PlatformGlyph key={p} platform={p} className="size-3.5 shrink-0" />
              ))}
            </span>
          </div>
          <p className="truncate text-xs text-muted-foreground">{channel.title}</p>
        </div>
        {offline ? (
          <span className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
            Offline
          </span>
        ) : (
          <>
            <span className="flex items-center gap-1.5 rounded-md bg-[#46c45a]/15 px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-[#46c45a]">
              <span className="size-1.5 rounded-full bg-[#46c45a]" />
              Live
            </span>
            <span className="rounded-md border border-white/10 bg-black/30 px-2 py-1 text-[0.72rem] font-medium tabular-nums text-foreground/90">
              {hasVideo(channel) ? `${formatCount(channel.viewers)} watching` : "live thread"}
            </span>
          </>
        )}
      </div>

      {offline ? (
        <OfflinePanel channel={channel} target={target} />
      ) : isDemo ? (
        /* Demo mode — plays /public/demo-stream.mp4 when present, dark frame otherwise. */
        <video
          key="demo"
          src="/demo-stream.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="relative z-10 flex-1 w-full object-cover"
        />
      ) : (
        /* Live mode — embedded platform player. */
        <StreamEmbed channel={channel} />
      )}
    </div>
  );
}

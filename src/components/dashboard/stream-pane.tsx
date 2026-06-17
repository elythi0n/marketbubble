"use client";

import { useEffect, useState } from "react";
import { Eye, ExternalLink, MonitorPlay, Play } from "lucide-react";

import { PlatformGlyph } from "@/components/feed/platform-glyph";
import type { Platform } from "@/lib/feed/types";
import { cn } from "@/lib/utils";
import { ClipsDialog, ClipSourceIcon } from "./clips-dialog";
import { useStockDrawer } from "@/lib/markets/stock-drawer-context";
import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange, formatPrice } from "@/lib/markets/types";
import { useChannel } from "@/lib/streamers/channel-context";
import { useViewMode } from "@/lib/stage-mode-context";
import type { Clip } from "@/lib/streamers/clips";
import { getHandle, hasVideo, primaryPlatform, type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, isStarting, nextOccurrence } from "@/lib/streamers/schedule";
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
      className="group flex w-[230px] shrink-0 flex-col overflow-hidden rounded-xl bg-overlay-weak text-left transition-colors hover:bg-overlay-medium"
    >
      <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-background">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={title} className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        ) : (
          <ClipSourceIcon platform={platform} className="size-9 opacity-[0.08]" />
        )}
        {/* Play + duration overlay a video frame — fixed white-on-black, theme-independent. */}
        <span className="absolute flex size-10 items-center justify-center rounded-full border border-white/15 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <Play className="size-4 translate-x-px fill-white text-white" />
        </span>
        {duration ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.62rem] tabular-nums text-white/90">
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
        {channel.schedule && isStarting(channel.schedule, now) ? (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm">
            <span className="size-1.5 animate-pulse rounded-full bg-feed-ok" />
            <span className="font-semibold text-feed-ok">Show is starting</span>
            <span className="text-muted-foreground">· the stream will appear here shortly</span>
          </p>
        ) : target ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Goes live {target.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            {" · in "}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {formatCountdown(target.getTime() - now.getTime())}
            </span>
          </p>
        ) : null}
        <p className="mt-1.5 text-xs text-muted-foreground/80">
          {channel.schedule && isStarting(channel.schedule, now)
            ? "hang tight · catch up below while you wait"
            : `${channel.name} is offline · catch up below while you wait`}
        </p>
      </div>

      {/* Recent clips / videos */}
      <section className="mx-auto mt-9 max-w-5xl">
        <h3 className="mb-3 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Recent broadcasts</h3>
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
                className="flex items-center justify-between rounded-lg bg-overlay-weak px-3.5 py-2.5 text-left transition-colors hover:bg-overlay-medium"
              >
                <div className="flex flex-col leading-tight">
                  <span className="font-mono text-[0.84rem] font-semibold text-foreground">{t.symbol}</span>
                  <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">{formatPrice(t.price)}</span>
                </div>
                <span className={`font-mono text-[0.78rem] font-medium tabular-nums ${up ? "text-feed-ok" : "text-feed-danger"}`}>
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

/** Twitch rejects bare IPs (and IPv6) as the embed `parent`; localhost and real domains are fine. */
function isTwitchEmbeddableHost(host: string): boolean {
  if (!host || host.includes(":")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  return true;
}

export function StreamEmbed({ channel, platform: platformProp }: { channel: Streamer; platform?: Platform }) {
  const platform = platformProp ?? channel.livePlatform ?? primaryPlatform(channel);
  // Resolved on the client only; Twitch needs the real embedding host as `parent`.
  const [host, setHost] = useState<string | null>(null);
  useEffect(() => {
    setHost(window.location.hostname);
  }, []);

  // X broadcasts have no embeddable player — chat flows into the feed, but there's no inline video.
  // Show a "live thread" panel with a link out instead of falling through to the Twitch embed.
  if (platform === "x" || !hasVideo(channel)) {
    const xHandle = getHandle(channel, "x");
    return (
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <PlatformGlyph platform="x" className="size-10 opacity-70" />
        <p className="max-w-sm text-sm text-muted-foreground">
          {channel.name} is live on X. There&apos;s no embeddable player — the broadcast chat appears in the feed.
        </p>
        <a
          href={`https://x.com/${xHandle}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-overlay-weak px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          <ExternalLink className="size-3.5" />
          Watch {channel.name} on X
        </a>
      </div>
    );
  }

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
  if (host === null) return <div className="relative z-10 flex-1" />;

  // Twitch can't embed on a bare IP, so offer a direct link instead of a misconfigured player.
  if (!isTwitchEmbeddableHost(host)) {
    return (
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <PlatformGlyph platform="twitch" className="size-10 opacity-70" />
        <p className="max-w-sm text-sm text-muted-foreground">
          Twitch&apos;s player can&apos;t embed on an IP address ({host}). Open the app on{" "}
          <span className="font-mono text-foreground">localhost</span> or the deployed domain to watch inline.
        </p>
        <a
          href={`https://twitch.tv/${twitchHandle}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong bg-overlay-weak px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-overlay-medium"
        >
          <ExternalLink className="size-3.5" />
          Watch {channel.name} on Twitch
        </a>
      </div>
    );
  }

  return (
    <iframe
      key={`twitch-${twitchHandle}-${host}`}
      src={`https://player.twitch.tv/?channel=${twitchHandle}&parent=${host}&muted=false`}
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
  const { active: viewMode } = useViewMode();
  const inOverlay = viewMode !== null;
  const channel: Streamer = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const offline = !channel.live;
  const target = channel.schedule ? nextOccurrence(channel.schedule, new Date()) : null;

  // Manual player choice when simulcasting (e.g. Kick's player is region-blocked for some viewers).
  const [playerPlatform, setPlayerPlatform] = useState<Platform | null>(null);
  useEffect(() => setPlayerPlatform(null), [channel.id]);
  const livePlatforms = channel.livePlatforms ?? [];
  const activePlatform =
    playerPlatform && livePlatforms.includes(playerPlatform)
      ? playerPlatform
      : (channel.livePlatform ?? primaryPlatform(channel));

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(255,255,255,0.05),transparent_60%)]" />
      {!offline ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.05]">
          <PlatformGlyph platform={activePlatform} className="size-64" tinted={false} />
        </div>
      ) : null}

      {/* Top identity bar — hidden on mobile (the badges below float over the player instead). */}
      <div className="relative z-10 hidden items-center gap-3 p-3 md:flex">
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
          <span className="rounded-md border border-hairline bg-overlay-weak px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">
            Offline
          </span>
        ) : (
          <>
            {livePlatforms.length > 1 ? (
              <span className="flex items-center gap-0.5 rounded-md border border-hairline bg-overlay-weak p-0.5" title="Choose which platform's player to watch">
                {livePlatforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlayerPlatform(p)}
                    aria-label={`Watch on ${p}`}
                    className={cn(
                      "flex size-6 items-center justify-center rounded transition-all",
                      p === activePlatform ? "bg-overlay-medium" : "opacity-45 hover:opacity-100",
                    )}
                  >
                    <PlatformGlyph platform={p} className="size-3.5" />
                  </button>
                ))}
              </span>
            ) : null}
            <span className="flex items-center gap-1.5 rounded-md bg-feed-ok/15 px-2 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-feed-ok">
              <span className="size-1.5 rounded-full bg-feed-ok" />
              Live
            </span>
            <span className="rounded-md border border-hairline bg-overlay-weak px-2 py-1 text-[0.72rem] font-medium tabular-nums text-foreground/90">
              {hasVideo(channel) ? `${formatCount(channel.viewers)} watching` : "live thread"}
            </span>
          </>
        )}
      </div>

      {/* Mobile-only floating badges over the player. Tiny, translucent, top-right — doesn't fight
          the platform player's own UI. Hidden on offline, in-overlay (the embed isn't there), and
          on desktop (the full identity bar above shows the same info). */}
      {!offline && !inOverlay && hasVideo(channel) ? (
        <div className="pointer-events-none absolute right-3 top-3 z-20 flex items-center gap-1.5 md:hidden">
          <span className="flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-feed-ok backdrop-blur-md">
            <span className="size-1.5 rounded-full bg-feed-ok" />
            Live
          </span>
          <span className="flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-0.5 text-[0.66rem] font-medium tabular-nums text-foreground/90 backdrop-blur-md">
            <Eye className="size-3" />
            {formatCount(channel.viewers)}
          </span>
        </div>
      ) : null}

      {offline ? (
        <OfflinePanel channel={channel} target={target} />
      ) : inOverlay ? (
        /* The single player moves to the active overlay (Stage/Theater/TV) while it's open — avoids
           mounting two embeds, which would otherwise double-up audio. */
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <MonitorPlay className="size-8 text-muted-foreground/70" />
          <p className="text-sm text-muted-foreground">Playing in {viewMode === "stage" ? "Stage" : viewMode === "theater" ? "Theater" : "TV"}</p>
        </div>
      ) : (
        /* Embedded platform player for the selected channel; real streams in both demo and live. */
        <StreamEmbed channel={channel} platform={activePlatform} />
      )}
    </div>
  );
}

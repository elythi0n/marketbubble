"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gift, Maximize, MessagesSquare, Minimize, Star, Users, X, type LucideIcon } from "lucide-react";

import { Feed } from "@/components/feed/feed";
import { PlatformGlyph } from "@/components/feed/platform-glyph";
import { useFeedContext, useFeedStats } from "@/lib/chat/feed-context";
import { useFilteredMessages } from "@/lib/settings/use-filtered-messages";
import type { FeedMessage } from "@/lib/feed/types";
import { useTickers } from "@/lib/markets/tickers-context";
import { formatChange } from "@/lib/markets/types";
import { useChannel } from "@/lib/streamers/channel-context";
import { hasVideo, type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, isStarting, nextOccurrence } from "@/lib/streamers/schedule";
import { useStageMode } from "@/lib/stage-mode-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { AnimatedNumber, AnimatedSwap } from "./animated-stat";
import { Marquee } from "./marquee";
import { MarketBubbleLogo } from "./market-bubble-logo";
import { PollCard } from "./poll-card";
import { PredictionsMarquee } from "./predictions-marquee";
import { StreamEmbed } from "./stream-pane";
import { StreamerAvatar } from "./streamer-avatar";

const EASE = [0.22, 1, 0.36, 1] as const;

/** Hard cap for the Stage title; CSS truncation handles the rest at narrower widths. */
const STAGE_TITLE_MAX = 100;

/** Identity chip: who's on, what they're streaming (title), and live state. */
function Identity({ channel }: { channel: Streamer }) {
  const rawTitle = channel.live ? channel.title || "Live now" : "Offline";
  const title = rawTitle.length > STAGE_TITLE_MAX ? `${rawTitle.slice(0, STAGE_TITLE_MAX).trimEnd()}…` : rawTitle;
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
      className="flex h-14 max-w-full items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3.5 backdrop-blur-md"
    >
      <StreamerAvatar streamer={channel} size={44} showLive={false} dim={false} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center gap-2">
          <span className="truncate text-[clamp(0.82rem,0.45vw+0.62rem,0.98rem)] font-semibold text-foreground">{channel.name}</span>
          <span className="flex shrink-0 items-center gap-1">
            {channel.platforms.map((p) => (
              <PlatformGlyph key={p} platform={p} className="size-3.5" />
            ))}
          </span>
          {channel.live ? (
            <span className="flex shrink-0 items-center gap-1 text-[0.6rem] font-bold uppercase tracking-wide text-[#46c45a]">
              <span className="size-1.5 rounded-full bg-[#46c45a]" style={{ boxShadow: "0 0 7px rgba(70,196,90,0.7)" }} />
              Live
            </span>
          ) : (
            <span className="shrink-0 text-[0.6rem] font-bold uppercase tracking-wide text-muted-foreground/70">Offline</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[clamp(0.6rem,0.3vw+0.47rem,0.72rem)] text-muted-foreground">{title}</p>
      </div>
    </motion.div>
  );
}

function StageStat({ label, value, emphasis }: { label: string; value: ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center px-3.5">
      <span className={`flex items-center gap-1.5 font-semibold leading-none tabular-nums text-foreground ${emphasis ? "text-[1.05rem]" : "text-[0.92rem]"}`}>
        {emphasis ? (
          <span className="size-1.5 rounded-full bg-[#46c45a]" style={{ boxShadow: "0 0 6px rgba(70,196,90,0.65)" }} />
        ) : null}
        {value}
      </span>
      <span className="mt-1 text-[0.5rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    </div>
  );
}

/** Combined overview stats (viewers across all live channels, chatters, top mover), like the bar. */
function StageStats() {
  const { streamers } = useChannel();
  const { uniqueChatters } = useFeedStats();
  const tickers = useTickers();
  const viewers = streamers.filter((s) => s.live).reduce((sum, s) => sum + (s.viewers || 0), 0);
  const topMover = [...tickers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0] ?? null;
  const up = (topMover?.changePct ?? 0) >= 0;

  // Hide viewers/chatters when nobody's live (0 viewers); the top mover is market data, always shown.
  const showViewers = viewers > 0;
  const showChatters = viewers > 0 && uniqueChatters > 0;

  return (
    <div className="flex h-14 items-stretch divide-x divide-white/10 rounded-xl border border-white/10 bg-black/35 backdrop-blur-md">
      {showViewers ? <StageStat label="Viewers" emphasis value={<AnimatedNumber value={viewers} />} /> : null}
      {showChatters ? <StageStat label="Chatters" value={<AnimatedNumber value={uniqueChatters} />} /> : null}
      {topMover ? (
        <StageStat
          label="Top mover"
          value={
            <AnimatedSwap swapKey={`${topMover.symbol}:${topMover.changePct}`}>
              <span>{topMover.symbol}</span>
              <span className={up ? "text-[#46c45a]" : "text-[#ef6a61]"}>{formatChange(topMover.changePct)}</span>
            </AnimatedSwap>
          }
        />
      ) : null}
    </div>
  );
}

/** Offline state inside the Stage stream card: the recurring slot + a live countdown. */
function NextStreamStage({ channel }: { channel: Streamer }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const target = channel.schedule ? nextOccurrence(channel.schedule, now) : null;

  return (
    <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <MarketBubbleLogo className="size-28 text-foreground opacity-[0.06]" />
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.24em] text-muted-foreground">Next stream</p>
      <h2 className="font-brand-wordmark text-[2rem] uppercase leading-none tracking-[0.015em] text-foreground sm:text-[2.6rem]">
        {channel.schedule?.label ?? "Schedule TBA"}
      </h2>
      {channel.schedule && isStarting(channel.schedule, now) ? (
        <p className="flex items-center gap-2 text-sm">
          <span className="size-1.5 animate-pulse rounded-full bg-[#46c45a]" />
          <span className="font-semibold text-[#46c45a]">Show is starting</span>
          <span className="text-muted-foreground">· the stream will appear here shortly</span>
        </p>
      ) : target ? (
        <p className="text-sm text-muted-foreground">
          Goes live {target.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
          {" · in "}
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {formatCountdown(target.getTime() - now.getTime())}
          </span>
        </p>
      ) : null}
      {channel.schedule && isStarting(channel.schedule, now) ? null : (
        <p className="text-xs text-muted-foreground/80">{channel.name} is offline</p>
      )}
    </div>
  );
}

const GIFT_TYPES = new Set<FeedMessage["type"]>(["giftsub", "sub", "resub", "raid"]);

function describeGift(m: FeedMessage): { icon: LucideIcon; accent: string; detail: string; amount: string | null } {
  const e = m.event ?? {};
  switch (m.type) {
    case "giftsub": {
      const count = e.count ?? 1;
      return { icon: Gift, accent: "var(--feed-warn)", detail: `gifted ${count} sub${count === 1 ? "" : "s"}`, amount: `×${count}` };
    }
    case "raid":
      return { icon: Users, accent: "var(--feed-ok)", detail: "raided the channel", amount: (e.viewers ?? 0).toLocaleString() };
    case "resub":
      return { icon: Star, accent: "var(--feed-link)", detail: "resubscribed", amount: e.months ? `${e.months}mo` : null };
    case "sub":
    default:
      return { icon: Star, accent: "var(--feed-link)", detail: "subscribed", amount: null };
  }
}

/** The most recent gift/sub/raid, shown as a compact card above the Stage chat. */
function StageLastGift() {
  const { messages } = useFeedContext();
  let gift: FeedMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].type && GIFT_TYPES.has(messages[i].type)) {
      gift = messages[i];
      break;
    }
  }

  return (
    <AnimatePresence mode="wait">
      {gift ? (
        (() => {
          const view = describeGift(gift);
          const Icon = view.icon;
          return (
            <motion.div
              key={gift.id}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="flex flex-none items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-[#141416]/85 px-3.5 py-2.5 backdrop-blur-md"
              style={{ boxShadow: `inset 2px 0 0 ${view.accent}` }}
            >
              <span
                className="flex size-8 flex-none items-center justify-center rounded-lg"
                style={{ backgroundColor: `color-mix(in srgb, ${view.accent} 16%, transparent)`, color: view.accent }}
              >
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold text-foreground">{gift.author}</span>
                  <PlatformGlyph platform={gift.platform} className="size-3 shrink-0" />
                </div>
                <span className="truncate text-[0.72rem] text-muted-foreground">
                  {view.detail}
                  {gift.channel ? <span className="text-foreground/70"> · {gift.channel}</span> : null}
                </span>
              </div>
              {view.amount ? (
                <span className="flex-none font-mono text-base font-bold tabular-nums" style={{ color: view.accent }}>
                  {view.amount}
                </span>
              ) : null}
            </motion.div>
          );
        })()
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Stage: a broadcast overlay over the running dashboard. Detached cards (stream + chat) on a
 * graphite gradient, a MarketBubble × Polymarket lockup centered up top, and markets + predictions
 * tickers along the bottom. Everything reads the live contexts, so the stream and chat keep running.
 */
export function StageOverlay() {
  const { isStage, setStage } = useStageMode();
  const { messages: rawMessages } = useFeedContext();
  const messages = useFilteredMessages(rawMessages);
  const { selectedId, streamers } = useChannel();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const isMobile = useIsMobile();

  // Stage is a desktop presentation; leave it if the viewport shrinks to mobile.
  useEffect(() => {
    if (isStage && isMobile) setStage(false);
  }, [isStage, isMobile, setStage]);

  // ── Full screen ─────────────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  // Leaving Stage also leaves full screen — it belongs to the presentation, not the dashboard.
  useEffect(() => {
    if (!isStage && typeof document !== "undefined" && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [isStage]);

  // While full screen, hide the idle mouse cursor (back on any movement).
  const [cursorHidden, setCursorHidden] = useState(false);
  useEffect(() => {
    if (!isFullscreen || !isStage) {
      setCursorHidden(false);
      return;
    }
    const IDLE_MS = 2500;
    let timer = setTimeout(() => setCursorHidden(true), IDLE_MS);
    const onMove = () => {
      setCursorHidden(false);
      clearTimeout(timer);
      timer = setTimeout(() => setCursorHidden(true), IDLE_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      setCursorHidden(false);
    };
  }, [isFullscreen, isStage]);

  const showVideo = channel?.live && hasVideo(channel);

  return (
    <AnimatePresence>
      {isStage && channel && !isMobile ? (
        <motion.div
          key="stage"
          className={`marketing-ambient-base fixed inset-0 z-[100] flex flex-col gap-3 overflow-hidden p-4 ${cursorHidden ? "mb-cursor-hidden" : ""}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
        >
          {/* Top bar: identity left · MarketBubble × Polymarket lockup centered · exit right. */}
          <motion.div
            className="grid flex-none grid-cols-[1fr_auto_1fr] items-center gap-3"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
          >
            <div className="min-w-0 justify-self-start">
              <Identity channel={channel} />
            </div>

            <div className="flex items-center gap-3.5 justify-self-center">
              <MarketBubbleLogo className="size-[54px] text-foreground" />
              <span className="text-xl font-light text-muted-foreground/50">×</span>
              <a
                href="https://polymarket.com/?utm_source=marketbubble&utm_medium=referral&utm_campaign=presented_by"
                target="_blank"
                rel="noreferrer noopener"
                aria-label="Polymarket"
                className="flex items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/polymarket.svg" alt="Polymarket" className="h-[27px] w-auto opacity-90 invert transition-opacity hover:opacity-100" />
              </a>
            </div>

            <div className="flex items-center gap-4 justify-self-end">
              <StageStats />
              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
                className="flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
              </button>
              <button
                type="button"
                onClick={() => setStage(false)}
                aria-label="Exit Stage"
                title="Exit Stage"
                className="flex items-center justify-center pr-2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-6" />
              </button>
            </div>
          </motion.div>

          {/* Detached cards: stream floats left, chat floats right, both rounded. */}
          <div className="flex min-h-0 flex-1 gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40"
            >
              {showVideo ? (
                <StreamEmbed channel={channel} />
              ) : channel.live ? (
                <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4">
                  <MarketBubbleLogo className="size-44 text-foreground opacity-[0.06]" />
                  <p className="text-sm text-muted-foreground">Live thread</p>
                </div>
              ) : (
                <NextStreamStage channel={channel} />
              )}
            </motion.div>

            <motion.aside
              initial={{ opacity: 0, x: 28 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 28 }}
              transition={{ duration: 0.45, ease: EASE }}
              className="flex w-[clamp(320px,26vw,420px)] flex-none flex-col gap-3"
            >
              <StageLastGift />
              {/* Live poll above the chat, options stacked top-to-bottom. */}
              <PollCard variant="stage" />
              <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#141416]/85 backdrop-blur-md">
                <Feed
                  messages={messages}
                  showSource
                  scale={1.3}
                  emptyIcon={MessagesSquare}
                  emptyLabel="Waiting for chat…"
                  emptySubtext="Messages appear here as people chat"
                />
              </div>
            </motion.aside>
          </div>

          {/* Polymarket predictions ticker (detached strip). */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.04 }}
            className="flex-none overflow-hidden rounded-xl border border-white/10"
          >
            <PredictionsMarquee />
          </motion.div>

          {/* Markets ticker, slightly larger, as a detached strip. */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="flex-none overflow-hidden rounded-xl border border-white/10"
          >
            <Marquee large />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

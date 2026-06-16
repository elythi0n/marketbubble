"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { useFeedStats } from "@/lib/chat/feed-context";
import { formatChange } from "@/lib/markets/types";
import { useTickers } from "@/lib/markets/tickers-context";
import { useChannel } from "@/lib/streamers/channel-context";
import { type Streamer } from "@/lib/streamers/mock";
import { DEFAULT_SCHEDULE, formatCountdown, isStarting, nextOccurrence } from "@/lib/streamers/schedule";
import { AnimatedNumber, AnimatedSwap } from "./animated-stat";

function StatCell({ label, emphasis, children }: { label: string; emphasis?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-none flex-col items-center justify-center px-6">
      <span
        className={`flex items-center gap-2 font-semibold leading-none tabular-nums text-foreground ${
          emphasis ? "text-[1.3rem]" : "text-[1.05rem]"
        }`}
      >
        {emphasis ? (
          <span className="size-[7px] rounded-full bg-feed-ok" style={{ boxShadow: "0 0 7px rgba(70,196,90,0.65)" }} />
        ) : null}
        {children}
      </span>
      <span className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
    </div>
  );
}

/** Countdown clock that re-renders every 30 s. */
function NextStreamCell({ schedule }: { schedule: NonNullable<Streamer["schedule"]> }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const starting = isStarting(schedule, now);
  const target = nextOccurrence(schedule, now);
  const countdown = starting ? "starting…" : formatCountdown(target.getTime() - now.getTime());

  return (
    <StatCell label={starting ? "Show is starting" : schedule.label}>
      <AnimatedSwap swapKey={countdown}>
        <span className={starting ? "text-feed-ok" : "text-muted-foreground/90"}>{countdown}</span>
      </AnimatedSwap>
    </StatCell>
  );
}

export function StatBand() {
  const { uniqueChatters, topCashtag, giftCount } = useFeedStats();
  const { selectedId, streamers } = useChannel();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const tickers = useTickers();

  const topMover = [...tickers].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))[0] ?? null;
  const moverUp = (topMover?.changePct ?? 0) >= 0;

  // The band is a combined overview of every streamer, not just the selected one: viewers sum across
  // all live channels, and chat-derived stats reflect the unified feed.
  const liveStreamers = streamers.filter((s) => s.live);
  const anyLive = liveStreamers.length > 0;
  const viewers = liveStreamers.reduce((sum, s) => sum + (s.viewers || 0), 0);
  // When nothing is live, fall back to a schedule for the countdown: the selected channel's, else
  // any roster entry's, else the show's default slot (roster overrides carry no schedule).
  const schedule = channel?.schedule ?? streamers.find((s) => s.schedule)?.schedule ?? DEFAULT_SCHEDULE;

  const showChatters = anyLive && uniqueChatters > 0;
  const showTrending = anyLive && !!topCashtag;
  const showGifts = anyLive && giftCount > 0;

  const cellVariants = {
    hidden: { opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0, overflow: "hidden" },
    visible: { opacity: 1, width: "auto", paddingLeft: undefined, paddingRight: undefined, overflow: "visible" },
  };

  return (
    <div className="relative z-20 flex h-[3.25rem] flex-none items-center overflow-x-auto border-b border-hairline bg-background [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex items-stretch divide-x divide-hairline">

        {/* Combined viewers across all live streamers; the schedule countdown when none are live. */}
        {anyLive ? (
          <StatCell label="Viewers" emphasis>
            <AnimatedNumber value={viewers} />
          </StatCell>
        ) : (
          <NextStreamCell schedule={schedule} />
        )}

        <AnimatePresence initial={false}>
          {showChatters && (
            <motion.div
              key="chatters"
              variants={cellVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-stretch border-l border-hairline"
            >
              <StatCell label="Chatters">
                <AnimatedNumber value={uniqueChatters} />
              </StatCell>
            </motion.div>
          )}
          {showTrending && (
            <motion.div
              key="trending"
              variants={cellVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-stretch border-l border-hairline"
            >
              <StatCell label="Trending">
                <AnimatedSwap swapKey={topCashtag}>
                  <span className="text-feed-warn">${topCashtag}</span>
                </AnimatedSwap>
              </StatCell>
            </motion.div>
          )}
          {showGifts && (
            <motion.div
              key="gifts"
              variants={cellVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-stretch border-l border-hairline"
            >
              <StatCell label="Gifts">
                <AnimatedNumber value={giftCount} />
              </StatCell>
            </motion.div>
          )}
        </AnimatePresence>

        <StatCell label="Top mover">
          <AnimatedSwap swapKey={topMover ? `${topMover.symbol}:${topMover.changePct}` : "—"}>
            {topMover ? (
              <>
                <span>{topMover.symbol}</span>
                <span className={moverUp ? "text-feed-ok" : "text-feed-danger"}>{formatChange(topMover.changePct)}</span>
              </>
            ) : (
              <span className="text-muted-foreground/60">—</span>
            )}
          </AnimatedSwap>
        </StatCell>
      </div>
    </div>
  );
}

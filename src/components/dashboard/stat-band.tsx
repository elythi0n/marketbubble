"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";

import { useFeedStats } from "@/lib/chat/feed-context";
import { formatChange } from "@/lib/markets/types";
import { useTickers } from "@/lib/markets/tickers-context";
import { useChannel } from "@/lib/streamers/channel-context";
import { type Streamer } from "@/lib/streamers/mock";
import { formatCountdown, nextOccurrence } from "@/lib/streamers/schedule";

function AnimatedNumber({ value, format = (n: number) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const mv = useMotionValue(value);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [value, mv]);
  return <>{format(shown)}</>;
}

function AnimatedSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={swapKey}
        initial={{ y: 9, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -9, opacity: 0 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
        className="inline-flex items-baseline gap-1.5"
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}

function StatCell({ label, emphasis, children }: { label: string; emphasis?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-none flex-col items-center justify-center px-6">
      <span
        className={`flex items-center gap-2 font-semibold leading-none tabular-nums text-foreground ${
          emphasis ? "text-[1.3rem]" : "text-[1.05rem]"
        }`}
      >
        {emphasis ? (
          <span className="size-[7px] rounded-full bg-[#46c45a]" style={{ boxShadow: "0 0 7px rgba(70,196,90,0.65)" }} />
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

  const target = nextOccurrence(schedule, now);
  const countdown = formatCountdown(target.getTime() - now.getTime());

  return (
    <StatCell label="Next stream">
      <AnimatedSwap swapKey={countdown}>
        <span className="text-muted-foreground/90">{countdown}</span>
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

  const viewers = channel.live ? channel.viewers : 0;

  const showChatters = channel.live && uniqueChatters > 0;
  const showTrending = channel.live && !!topCashtag;
  const showGifts = channel.live && giftCount > 0;

  const cellVariants = {
    hidden: { opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0, overflow: "hidden" },
    visible: { opacity: 1, width: "auto", paddingLeft: undefined, paddingRight: undefined, overflow: "visible" },
  };

  return (
    <div className="relative z-20 flex h-[3.25rem] flex-none items-center overflow-x-auto border-b border-white/[0.07] bg-[#141416] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto flex items-stretch divide-x divide-white/[0.07]">

        {/* Viewers when live, countdown when offline */}
        {channel.live !== false ? (
          <StatCell label="Viewers" emphasis>
            <AnimatedNumber value={viewers} />
          </StatCell>
        ) : channel.schedule ? (
          <NextStreamCell schedule={channel.schedule} />
        ) : (
          <StatCell label="Viewers">
            <span className="text-muted-foreground/60">—</span>
          </StatCell>
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
              className="flex items-stretch border-l border-white/[0.07]"
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
              className="flex items-stretch border-l border-white/[0.07]"
            >
              <StatCell label="Trending">
                <AnimatedSwap swapKey={topCashtag}>
                  <span className="text-[#d8b25a]">${topCashtag}</span>
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
              className="flex items-stretch border-l border-white/[0.07]"
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
                <span className={moverUp ? "text-[#46c45a]" : "text-[#ef6a61]"}>{formatChange(topMover.changePct)}</span>
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

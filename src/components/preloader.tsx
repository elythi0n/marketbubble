"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useEffect, useLayoutEffect, useState } from "react";

import { MarketBubbleLogo } from "@/components/dashboard/market-bubble-logo";

const MESSAGES = ["Make Money", "Command Attention", "Leverage AI"];

// Layout effect on the client (set the tagline before paint, no flash); plain effect on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const logoVariants: Variants = {
  // Immediately visible, then a quick bounce-in (jumps closer, springs back), then zooms out on exit.
  initial: { scale: 1, opacity: 1 },
  animate: { scale: [1, 1.16, 1], transition: { duration: 0.7, ease: "easeInOut", times: [0, 0.45, 1] } },
  exit: { scale: 1.3, opacity: 0, transition: { duration: 0.4, ease: "easeIn" } },
};

export function Preloader() {
  const [show, setShow] = useState(true);
  const [slow, setSlow] = useState(false);
  // Rotate through the taglines across reloads (persisted index), so each load shows the next one.
  // Client-only to avoid a hydration mismatch.
  const [tagline, setTagline] = useState(MESSAGES[0]);
  useIsomorphicLayoutEffect(() => {
    let i = 0;
    try {
      i = Number(localStorage.getItem("mb-tagline-i") ?? "0") % MESSAGES.length;
      if (!Number.isInteger(i) || i < 0) i = 0;
      localStorage.setItem("mb-tagline-i", String((i + 1) % MESSAGES.length));
    } catch {
      /* localStorage unavailable */
    }
    setTagline(MESSAGES[i]);
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("mb-preloaded")) {
        setShow(false);
        return;
      }
    } catch {
      /* sessionStorage unavailable */
    }

    const start = Date.now();
    const MIN = 1300; // minimum on-screen time so the entrance plays
    const LINE_AFTER = 1700; // only show the line if loading drags past this
    const MAX = 6000; // safety cap
    let done = false;

    const slowTimer = setTimeout(() => setSlow(true), LINE_AFTER);
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(slowTimer);
      clearTimeout(cap);
      window.removeEventListener("load", onReady);
      setShow(false);
      try {
        sessionStorage.setItem("mb-preloaded", "1");
      } catch {
        /* ignore */
      }
    };
    const onReady = () => setTimeout(finish, Math.max(0, MIN - (Date.now() - start)));
    const cap = setTimeout(finish, MAX);

    if (document.readyState === "complete") onReady();
    else window.addEventListener("load", onReady, { once: true });

    return () => {
      clearTimeout(slowTimer);
      clearTimeout(cap);
      window.removeEventListener("load", onReady);
    };
  }, []);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key="preloader"
          className="marketing-ambient-base fixed inset-0 z-[200] flex flex-col items-center justify-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: "easeInOut" }}
        >
          <motion.div variants={logoVariants} initial="initial" animate="animate" exit="exit">
            <MarketBubbleLogo className="size-20 text-foreground" />
          </motion.div>

          {/* Line only appears if the site takes a while to load. */}
          <div className="mt-8 h-[3px] w-32">
            <AnimatePresence>
              {slow ? (
                <motion.div
                  className="h-full w-full overflow-hidden rounded-full bg-white/[0.1]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className="h-full w-1/3 rounded-full bg-foreground"
                    animate={{ x: ["-110%", "330%"] }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          {/* Static tagline, shown immediately. */}
          <span className="absolute bottom-[15%] px-6 text-center font-brand-wordmark text-sm uppercase tracking-[0.28em] text-foreground/35">
            {tagline}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

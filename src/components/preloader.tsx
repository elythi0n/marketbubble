"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
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
  const pathname = usePathname();
  const [show, setShow] = useState(true);
  // The OBS overlay must render bare — no splash inside a browser source.
  const skip = pathname?.startsWith("/overlay") ?? false;
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

    // This effect running means React has hydrated and the app is interactive — don't wait for
    // window `load` (it blocks on stream iframes and thumbnails, stretching launch to seconds).
    // Hold just long enough for the entrance animation to play, then get out of the way.
    const MIN = 900;
    const timer = setTimeout(() => {
      setShow(false);
      try {
        sessionStorage.setItem("mb-preloaded", "1");
      } catch {
        /* ignore */
      }
    }, MIN);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {show && !skip ? (
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

          {/* Static tagline, shown immediately. */}
          <span className="absolute bottom-[15%] px-6 text-center font-brand-wordmark text-sm uppercase tracking-[0.28em] text-foreground/35">
            {tagline}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

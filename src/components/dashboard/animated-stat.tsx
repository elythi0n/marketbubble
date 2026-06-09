"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useMotionValue } from "framer-motion";

/** Tweens to its target whenever `value` changes (YouTube-style smooth count). */
export function AnimatedNumber({
  value,
  format = (n: number) => Math.round(n).toLocaleString(),
}: {
  value: number;
  format?: (n: number) => string;
}) {
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

/** Crossfades between values (for text indicators like the trending cashtag / top mover). */
export function AnimatedSwap({ swapKey, children }: { swapKey: string; children: ReactNode }) {
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

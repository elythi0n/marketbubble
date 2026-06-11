"use client";

import { useEffect, useState } from "react";

/**
 * Returns true on narrow (mobile) viewports. SSR-safe (false first paint, corrects on mount) so the
 * desktop dockview never mounts on phones — we render a separate touch layout instead.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}

/**
 * True on a phone rotated to landscape: short, touch-first viewport. A rotated phone is *wider*
 * than the `useIsMobile` breakpoint, so the shell must check both before mounting the desktop
 * dockview — and this is the trigger for the fullscreen theater layout.
 */
export function usePhoneLandscape(): boolean {
  const [match, setMatch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 480px) and (pointer: coarse)");
    const update = () => setMatch(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return match;
}

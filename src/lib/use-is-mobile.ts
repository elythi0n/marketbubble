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

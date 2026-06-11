"use client";

import { useEffect } from "react";

/**
 * Keeps the screen awake while `active` (e.g. a live stream is playing on mobile). No-ops where
 * the Wake Lock API is unavailable; re-acquires on visibilitychange because the browser silently
 * releases the lock whenever the page is hidden.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let disposed = false;

    const acquire = () => {
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (disposed) void l.release().catch(() => {});
          else lock = l;
        })
        .catch(() => {
          /* denied (e.g. low battery) — nothing to do */
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}

"use client";

import { useEffect } from "react";

/**
 * Force the dark palette on the current page regardless of the operator's chosen theme. Used by
 * OBS overlay routes (/overlay, /overlay-poll, /overlay-giveaway): they composite over a live
 * stream so they must always render in the dark glyphs/inks that read on top of video — never
 * follow the dashboard's light/dark toggle (which is for the operator's eyeballs in the browser,
 * not the audience's). Toggles `.dark`/`.light` on <html>, restores the prior state on unmount.
 */
export function usePinDark() {
  useEffect(() => {
    const el = document.documentElement;
    const wasDark = el.classList.contains("dark");
    const wasLight = el.classList.contains("light");
    el.classList.add("dark");
    el.classList.remove("light");
    el.style.colorScheme = "dark";
    return () => {
      el.classList.toggle("dark", wasDark);
      el.classList.toggle("light", wasLight);
      el.style.colorScheme = wasDark ? "dark" : wasLight ? "light" : "";
    };
  }, []);
}

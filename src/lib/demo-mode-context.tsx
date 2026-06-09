"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "mb-demo-mode";

/**
 * Whether the Demo feature exists in this build. Set NEXT_PUBLIC_DEMO_DISABLED=1 to ship a
 * live-only product (the Live/Demo switch is hidden and the app stays in live mode).
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_DISABLED !== "1";

interface DemoModeContextValue {
  isDemo: boolean;
  toggle: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch). Skipped when demo is disabled.
  useEffect(() => {
    if (!DEMO_ENABLED) return;
    setIsDemo(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = () => {
    if (!DEMO_ENABLED) return;
    setIsDemo((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return <DemoModeContext.Provider value={{ isDemo, toggle }}>{children}</DemoModeContext.Provider>;
}

const FALLBACK: DemoModeContextValue = { isDemo: false, toggle: () => {} };

export function useDemoMode(): DemoModeContextValue {
  // Graceful fallback: pages outside DemoModeProvider (e.g. /markets) get a no-op.
  return useContext(DemoModeContext) ?? FALLBACK;
}

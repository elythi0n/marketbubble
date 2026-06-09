"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "mb-demo-mode";

interface DemoModeContextValue {
  isDemo: boolean;
  toggle: () => void;
}

const DemoModeContext = createContext<DemoModeContextValue | null>(null);

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemo, setIsDemo] = useState(false);

  // Hydrate from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    setIsDemo(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const toggle = () =>
    setIsDemo((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });

  return <DemoModeContext.Provider value={{ isDemo, toggle }}>{children}</DemoModeContext.Provider>;
}

const FALLBACK: DemoModeContextValue = { isDemo: false, toggle: () => {} };

export function useDemoMode(): DemoModeContextValue {
  // Graceful fallback: pages outside DemoModeProvider (e.g. /markets) get a no-op.
  return useContext(DemoModeContext) ?? FALLBACK;
}

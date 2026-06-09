"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface StageModeValue {
  isStage: boolean;
  setStage: (v: boolean) => void;
  toggle: () => void;
}

const StageModeContext = createContext<StageModeValue | null>(null);

/**
 * "Stage" is a broadcast overlay presentation of the live view. It's a pure UI mode (no remount):
 * the dashboard, its stream, and the chat connections all keep running underneath while the Stage
 * overlay composites chat + ticker + identity on top. Toggling back reveals everything unchanged.
 */
export function StageModeProvider({ children }: { children: ReactNode }) {
  const [isStage, setIsStage] = useState(false);

  // Convenience: open directly in Stage via ?stage=1 (e.g. as an OBS browser source URL).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("stage") === "1") setIsStage(true);
  }, []);

  // Esc leaves Stage.
  useEffect(() => {
    if (!isStage) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsStage(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isStage]);

  return (
    <StageModeContext.Provider value={{ isStage, setStage: setIsStage, toggle: () => setIsStage((v) => !v) }}>
      {children}
    </StageModeContext.Provider>
  );
}

const FALLBACK: StageModeValue = { isStage: false, setStage: () => {}, toggle: () => {} };

export function useStageMode(): StageModeValue {
  return useContext(StageModeContext) ?? FALLBACK;
}

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * View modes are immersive full-screen presentations of the live view. They're pure UI overlays
 * (no remount): the dashboard, its stream, and the chat connections all keep running underneath
 * while the active overlay composites on top. Toggling back reveals everything unchanged.
 *
 * - "stage"   broadcast overlay (OBS-ready) — gradient backdrop, ticker, identity, polls, predictions
 * - "theater" stream-dominant — large player + chat sidebar, panels hidden
 * - "tv"      lean-back — fullscreen stream with a minimal identity strip
 */
export type ViewMode = "stage" | "theater" | "tv";

const MODES: ReadonlySet<ViewMode> = new Set(["stage", "theater", "tv"]);
const SELECTED_KEY = "mb-view-mode";

interface ViewModeValue {
  /** The mode currently rendered on screen (null = normal dashboard). */
  active: ViewMode | null;
  /** Persisted last-chosen mode — drives the toggle button's icon and click behavior. */
  selected: ViewMode;
  /** Enter a mode (defaults to `selected` when no arg given). */
  enter: (mode?: ViewMode) => void;
  /** Leave the active mode. */
  exit: () => void;
  /** Toggle the selected mode on/off. */
  toggle: () => void;
  /** Change which mode the button represents; persisted to localStorage only — does NOT activate. */
  setSelected: (mode: ViewMode) => void;
  /** Set the button's default AND activate that mode in one call (menu-pick action). */
  selectAndEnter: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeValue | null>(null);

export function StageModeProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ViewMode | null>(null);
  const [selected, setSelectedState] = useState<ViewMode>("stage");

  // Restore the user's last-chosen mode so the button reflects it before any interaction.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SELECTED_KEY);
      if (stored && MODES.has(stored as ViewMode)) setSelectedState(stored as ViewMode);
    } catch {}
  }, []);

  // ?stage=1 opens directly in Stage (used as an OBS browser source URL). Also align `selected`
  // so that if the operator hits Esc to leave Stage and then clicks the top-nav button, the
  // button stays a Stage button rather than dropping them into whatever was previously persisted.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("stage") === "1") {
      setActive("stage");
      setSelectedState("stage");
      try {
        localStorage.setItem(SELECTED_KEY, "stage");
      } catch {}
    }
  }, []);

  // Esc leaves any active overlay.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  const setSelected = (mode: ViewMode) => {
    setSelectedState(mode);
    try {
      localStorage.setItem(SELECTED_KEY, mode);
    } catch {}
  };

  const selectAndEnter = (mode: ViewMode) => {
    setSelected(mode);
    setActive(mode);
  };

  const enter = (mode?: ViewMode) => setActive(mode ?? selected);
  const exit = () => setActive(null);
  // Toggle only acts on the *selected* mode: if a different overlay is already up, switch to the
  // selected one rather than silently closing it (the button would otherwise close Theater when
  // its icon says "Open Stage", which screen readers announce wrong).
  const toggle = () => {
    setActive((curr) => (curr === selected ? null : selected));
  };

  return (
    <ViewModeContext.Provider value={{ active, selected, enter, exit, toggle, setSelected, selectAndEnter }}>
      {children}
    </ViewModeContext.Provider>
  );
}

const FALLBACK: ViewModeValue = {
  active: null,
  selected: "stage",
  enter: () => {},
  exit: () => {},
  toggle: () => {},
  setSelected: () => {},
  selectAndEnter: () => {},
};

export function useViewMode(): ViewModeValue {
  return useContext(ViewModeContext) ?? FALLBACK;
}

/**
 * Back-compat for callers that pre-date multi-mode. `isStage` is true only when Stage is the active
 * overlay; `setStage(true)` forces Stage on (regardless of the persisted selection), `setStage(false)`
 * exits whatever's active.
 */
export function useStageMode() {
  const v = useViewMode();
  return {
    isStage: v.active === "stage",
    setStage: (on: boolean) => (on ? v.enter("stage") : v.exit()),
    toggle: () => (v.active === "stage" ? v.exit() : v.enter("stage")),
  };
}

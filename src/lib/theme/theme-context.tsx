"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Theme is intentionally separate from the rest of the settings store (`mb-settings-v1`): it has to
 * be read by a tiny pre-hydration inline script (see `ThemeScript`) before any React runs, so the
 * page paints in the right palette with no flash. Keeping it under its own key keeps that script
 * trivial and avoids parsing the whole settings blob synchronously on load.
 */
export const THEME_STORAGE_KEY = "mb-theme";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Brand default — unset visitors get the dark graphite palette. */
const DEFAULT_CHOICE: ThemeChoice = "dark";

interface ThemeContextValue {
  /** The user's selection: light, dark, or follow-the-OS. */
  theme: ThemeChoice;
  /** What's actually applied right now (system resolved against the OS preference). */
  resolvedTheme: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Mirror the resolved theme onto <html> (the `.dark` class drives every CSS token). */
function apply(resolved: ResolvedTheme) {
  const el = document.documentElement;
  el.classList.toggle("dark", resolved === "dark");
  el.classList.toggle("light", resolved === "light");
  el.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Start from the brand default for a deterministic SSR render; the inline script has already set
  // the real class on <html>, and the effect below reconciles state after mount.
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_CHOICE);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("dark");

  // Hydrate the stored choice once mounted.
  useEffect(() => {
    let stored: ThemeChoice | null = null;
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") stored = raw;
    } catch {}
    const choice = stored ?? DEFAULT_CHOICE;
    setThemeState(choice);
    const next = resolve(choice);
    setResolvedTheme(next);
    apply(next);
  }, []);

  // While on "system", track live OS changes.
  useEffect(() => {
    if (theme !== "system") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const next = resolve("system");
      setResolvedTheme(next);
      apply(next);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    const next = resolve(choice);
    setResolvedTheme(next);
    apply(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {}
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

/**
 * Blocking inline script rendered before the app: reads the stored choice (defaulting to dark) and
 * sets the `.dark`/`.light` class + color-scheme on <html> before first paint. This is what
 * prevents a light/dark flash on load. Kept dependency-free and tiny on purpose.
 */
export function ThemeScript() {
  const js = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var c=localStorage.getItem(k);if(c!=="light"&&c!=="dark"&&c!=="system")c=${JSON.stringify(DEFAULT_CHOICE)};var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.classList.toggle("light",!d);e.style.colorScheme=d?"dark":"light";}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

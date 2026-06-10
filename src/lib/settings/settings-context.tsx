"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const STORAGE_KEY = "mb-settings-v1";

export type FilterAction = "highlight" | "mute";
export type FilterField = "text" | "author";

export interface FilterRule {
  id: string;
  pattern: string;
  action: FilterAction;
  /** "text" matches the message body (incl. emote codes/mentions/cashtags); "author" the sender. */
  field: FilterField;
}

export type ChatDensity = "compact" | "cozy" | "comfortable";

export interface Settings {
  showTimestamps: boolean;
  /** Show the original text of deleted messages (struck through) instead of a tombstone. */
  showDeleted: boolean;
  density: ChatDensity;
  /** Tint rows from the channel's broadcaster so the streamer's own messages stand out. */
  emphasizeStreamer: boolean;
  /** Opt-in: gather live chat in memory (session-only) so the AI assistant can search it. */
  assistantOptIn: boolean;
  /** How many messages the assistant's in-memory archive keeps. */
  assistantArchiveSize: number;
  /** Comma-separated names the Mention Inbox watches for across all channels. */
  mentionNames: string;
  filters: FilterRule[];
}

export const DEFAULT_SETTINGS: Settings = {
  showTimestamps: true,
  showDeleted: false,
  density: "cozy",
  emphasizeStreamer: true,
  assistantOptIn: false,
  assistantArchiveSize: 5000,
  mentionNames: "",
  filters: [],
};

interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  addFilter: (rule: Omit<FilterRule, "id">) => void;
  removeFilter: (id: string) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Hydrate after mount (avoids SSR mismatch); merging over defaults drops stale keys gracefully.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) });
    } catch {}
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const save = (next: Settings) => {
      setSettings(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
    };
    return {
      settings,
      update: (patch) => save({ ...settings, ...patch }),
      addFilter: (rule) => save({ ...settings, filters: [...settings.filters, { ...rule, id: crypto.randomUUID() }] }),
      removeFilter: (id) => save({ ...settings, filters: settings.filters.filter((f) => f.id !== id) }),
      reset: () => save(DEFAULT_SETTINGS),
    };
  }, [settings]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const v = useContext(SettingsContext);
  if (!v) throw new Error("useSettings must be used within a SettingsProvider");
  return v;
}

/** Settings for display components that may render outside the provider (falls back to defaults). */
export function useSettingsOrDefault(): Settings {
  return useContext(SettingsContext)?.settings ?? DEFAULT_SETTINGS;
}

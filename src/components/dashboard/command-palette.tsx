"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlignJustify,
  AtSign,
  BarChart3,
  Cast,
  Clock,
  Eye,
  FlaskConical,
  Inbox,
  Layers,
  MessagesSquare,
  MonitorPlay,
  Newspaper,
  Play,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { AI_ENABLED } from "@/lib/assistant/config";
import { useControl } from "@/lib/control/client";
import { hasDock, openChannelChat, openPanel } from "@/lib/dock-api";
import { DEMO_ENABLED, useDemoMode } from "@/lib/demo-mode-context";
import { useSettings, type ChatDensity } from "@/lib/settings/settings-context";
import { useStageMode } from "@/lib/stage-mode-context";
import { useChannel } from "@/lib/streamers/channel-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;

interface Command {
  id: string;
  label: string;
  category: string;
  icon: LucideIcon;
  /** Right-aligned state hint (e.g. "On", "12.3K watching", "Active"). */
  hint?: string;
  /** Extra search terms beyond the label. */
  keywords?: string;
  run: () => void;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

const DENSITIES: { value: ChatDensity; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "cozy", label: "Cozy" },
  { value: "comfortable", label: "Comfortable" },
];

const PANELS: { id: string; title: string; icon: LucideIcon }[] = [
  { id: "markets", title: "Markets", icon: BarChart3 },
  { id: "news", title: "Market News", icon: Newspaper },
  { id: "predictions", title: "Predictions", icon: TrendingUp },
  { id: "mentions", title: "X Mentions", icon: AtSign },
  { id: "inbox", title: "Mention Inbox", icon: Inbox },
  { id: "hyperliquid", title: "Hyperliquid", icon: Activity },
  ...(AI_ENABLED ? [{ id: "assistant", title: "Assistant", icon: Sparkles }] : []),
  { id: "settings", title: "Settings", icon: Settings2 },
];

/**
 * Ctrl/Cmd+K command palette. Invisible until summoned — no persistent search bar. Searches and
 * runs actions: enter Stage, toggle chat options, switch/open channels, open panels, navigate.
 */
export function CommandPalette() {
  const isMobile = useIsMobile();
  const router = useRouter();
  const { isStage, setStage } = useStageMode();
  const { settings, update } = useSettings();
  const { streamers, select, mergeAll, setMergeAll } = useChannel();
  const { isDemo, toggle: toggleDemo } = useDemoMode();
  const { flags } = useControl();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fresh state every time it opens.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      // The input mounts with the animation; focus on the next frame.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const dock = hasDock();
    const cmds: Command[] = [];

    cmds.push({
      id: "stage",
      label: isStage ? "Exit Stage" : "Enter Stage",
      category: "Stage",
      icon: MonitorPlay,
      keywords: "broadcast overlay fullscreen present",
      run: () => setStage(!isStage),
    });

    cmds.push(
      {
        id: "merge",
        label: mergeAll ? "Follow selected channel only" : "Merge all live channels",
        category: "Chat",
        icon: Layers,
        keywords: "merge unified single feed scope",
        run: () => setMergeAll(!mergeAll),
      },
      {
        id: "timestamps",
        label: "Toggle timestamps",
        category: "Chat",
        icon: Clock,
        hint: settings.showTimestamps ? "On" : "Off",
        run: () => update({ showTimestamps: !settings.showTimestamps }),
      },
      {
        id: "emphasis",
        label: "Toggle streamer emphasis",
        category: "Chat",
        icon: Star,
        hint: settings.emphasizeStreamer ? "On" : "Off",
        keywords: "broadcaster host tint",
        run: () => update({ emphasizeStreamer: !settings.emphasizeStreamer }),
      },
      {
        id: "deleted",
        label: "Toggle deleted message text",
        category: "Chat",
        icon: Eye,
        hint: settings.showDeleted ? "On" : "Off",
        run: () => update({ showDeleted: !settings.showDeleted }),
      },
      ...DENSITIES.map(
        (d): Command => ({
          id: `density-${d.value}`,
          label: `Density: ${d.label}`,
          category: "Chat",
          icon: AlignJustify,
          hint: settings.density === d.value ? "Active" : undefined,
          keywords: "size spacing font rows",
          run: () => update({ density: d.value }),
        }),
      ),
    );

    for (const s of streamers) {
      cmds.push({
        id: `watch-${s.id}`,
        label: `Watch ${s.name}`,
        category: "Channels",
        icon: Play,
        hint: s.live ? `${formatCount(s.viewers)} watching` : "Offline",
        keywords: Object.values(s.handles).join(" "),
        run: () => select(s.id),
      });
      if (dock && (s.handles.twitch || s.handles.kick)) {
        cmds.push({
          id: `chat-${s.id}`,
          label: `Open ${s.name} chat panel`,
          category: "Channels",
          icon: MessagesSquare,
          keywords: Object.values(s.handles).join(" "),
          run: () => openChannelChat(s),
        });
      }
    }

    if (dock) {
      for (const p of PANELS) {
        // Runtime flags (set from /admin) remove operator-disabled panels live.
        if (p.id === "assistant" && flags.assistant === false) continue;
        if (p.id === "predictions" && flags.predictions === false) continue;
        cmds.push({
          id: `panel-${p.id}`,
          label: `Open ${p.title}`,
          category: "Panels",
          icon: p.icon,
          run: () => openPanel(p.id, p.title),
        });
      }
    }

    cmds.push(
      {
        id: "obs-overlay",
        label: "Open OBS overlay",
        category: "Workspace",
        icon: Cast,
        keywords: "obs browser source stream overlay chat widget",
        // No features string: passing one makes browsers open a popup window instead of a tab.
        run: () => window.open("/overlay", "_blank"),
      },
      {
        id: "page-markets",
        label: "Go to Markets page",
        category: "Workspace",
        icon: BarChart3,
        run: () => router.push("/markets"),
      },
      {
        id: "page-leaderboard",
        label: "Go to Leaderboard page",
        category: "Workspace",
        icon: Trophy,
        run: () => router.push("/leaderboard"),
      },
      {
        id: "reset-layout",
        label: "Reset panel layout",
        category: "Workspace",
        icon: RotateCcw,
        keywords: "default workspace dock",
        run: () => {
          localStorage.removeItem("mb-dock-layout-v2");
          window.location.reload();
        },
      },
    );
    if (DEMO_ENABLED) {
      cmds.push({
        id: "demo",
        label: isDemo ? "Switch to Live mode" : "Switch to Demo mode",
        category: "Workspace",
        icon: FlaskConical,
        keywords: "demo live mode toggle",
        run: toggleDemo,
      });
    }

    return cmds;
  }, [isStage, setStage, mergeAll, setMergeAll, settings, update, streamers, select, isDemo, toggleDemo, router, flags]);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? commands.filter((c) => `${c.label} ${c.category} ${c.keywords ?? ""}`.toLowerCase().includes(q))
    : commands;
  const clampedActive = Math.min(active, Math.max(0, filtered.length - 1));

  const run = (c: Command) => {
    setOpen(false);
    c.run();
  };

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = filtered.length === 0 ? 0 : (clampedActive + dir + filtered.length) % filtered.length;
      setActive(next);
      listRef.current
        ?.querySelector(`[data-cmd-index="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[clampedActive];
      if (c) run(c);
    }
  };

  if (isMobile) return null;

  let lastCategory: string | null = null;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: EASE }}
          className="fixed inset-0 z-[140] bg-black/45 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.985, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: -8 }}
            transition={{ duration: 0.18, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto mt-[18vh] flex w-[min(560px,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-white/12 bg-[#1b1b1f] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.9)]"
          >
            <div className="flex flex-none items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-3">
              <Search className="size-4 flex-none text-muted-foreground/70" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKeyDown}
                placeholder="Type a command…"
                aria-label="Search commands"
                className="min-w-0 flex-1 bg-transparent text-[0.92rem] text-foreground outline-none placeholder:text-muted-foreground/45"
              />
              <kbd className="flex-none rounded border border-white/12 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[0.6rem] text-muted-foreground">
                esc
              </kbd>
            </div>

            <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1.5 mb-scroll">
              {filtered.length === 0 ? (
                <p className="px-2 py-6 text-center text-[0.78rem] text-muted-foreground/70">No matching commands</p>
              ) : (
                filtered.map((c, i) => {
                  const heading = c.category !== lastCategory ? c.category : null;
                  lastCategory = c.category;
                  const Icon = c.icon;
                  return (
                    <div key={c.id}>
                      {heading ? (
                        <p className="px-2 pb-1 pt-2 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          {heading}
                        </p>
                      ) : null}
                      <button
                        type="button"
                        data-cmd-index={i}
                        onClick={() => run(c)}
                        onMouseMove={() => setActive(i)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[0.84rem] transition-colors",
                          i === clampedActive ? "bg-white/[0.08] text-foreground" : "text-foreground/85",
                        )}
                      >
                        <Icon className="size-4 flex-none text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                        {c.hint ? (
                          <span
                            className={cn(
                              "flex-none font-mono text-[0.62rem] tabular-nums",
                              c.hint === "Active" || c.hint === "On" || c.hint.includes("watching")
                                ? "text-[#46c45a]"
                                : "text-muted-foreground/70",
                            )}
                          >
                            {c.hint}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex flex-none items-center gap-3 border-t border-white/[0.07] px-3.5 py-2 text-[0.62rem] text-muted-foreground/70">
              <span>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span>
                <kbd className="font-mono">↵</kbd> run
              </span>
              <span className="ml-auto font-mono">ctrl+k</span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

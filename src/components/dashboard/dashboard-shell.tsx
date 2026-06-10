"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Clapperboard, X } from "lucide-react";

import type { FeedMessage } from "@/lib/feed/types";
import type { Streamer } from "@/lib/streamers/mock";

import { AI_ENABLED } from "@/lib/assistant/config";
import { archiveMessages, setArchiveEnabled, setArchiveLimit } from "@/lib/assistant/archive";
import { useFlag } from "@/lib/control/client";
import { collectMentions, setMentionNames } from "@/lib/mentions/store";
import { useSettings } from "@/lib/settings/settings-context";
import { FeedProvider, useFeedContext } from "@/lib/chat/feed-context";
import { createKickProvider } from "@/lib/chat/providers/kick-pusher";
import { createTwitchIRCProvider } from "@/lib/chat/providers/twitch-irc";
import { createXChatProvider } from "@/lib/chat/providers/x-chat";
import { useDemoMode, DemoModeProvider, DEMO_ENABLED } from "@/lib/demo-mode-context";
import { SettingsProvider } from "@/lib/settings/settings-context";
import { StageModeProvider } from "@/lib/stage-mode-context";
import { TickersProvider } from "@/lib/markets/tickers-context";
import { ChannelProvider, useChannel } from "@/lib/streamers/channel-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { StageOverlay } from "./stage-overlay";
import { AnnouncementBanner } from "./announcement-banner";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { PollCard } from "./poll-card";
import { Marquee } from "./marquee";
import { MobileWorkspace } from "./mobile-workspace";
import { Sidebar } from "./sidebar";
import { StatBand } from "./stat-band";
import { StreamerSheet } from "./streamer-sheet";
import { TopNav } from "./top-nav";

/**
 * Rebuilds providers whenever the source set or demo mode changes.
 * Re-keying FeedProvider tears down old WebSocket connections and opens fresh ones.
 *
 * In merge mode the feed unifies every live channel into one stream (each row keeps its source);
 * otherwise it follows the single selected channel. The roster itself is the demo or live one,
 * supplied by ChannelContext. X chat (fed by the browser extension) is only added for the show.
 */
const HISTORY_KEY = "mb-chat-history-v1";
const HISTORY_KEEP = 300;
const HISTORY_MAX_AGE_MS = 12 * 3600_000;

// Restore persisted scrollback once per page load, into the first aggregator that has real sources.
let historyRestored = false;

function loadChatHistory(sources: Streamer[]): FeedMessage[] {
  if (historyRestored || sources.length === 0) return [];
  historyRestored = true;
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as FeedMessage[];
    if (!Array.isArray(arr)) return [];
    const handles = new Set(
      sources.flatMap((s) => Object.values(s.handles).filter(Boolean).map((h) => h!.toLowerCase())),
    );
    const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
    // Only messages that belong to the channels we're about to connect to (or X show chat).
    return arr.filter((m) => m?.id && m.tsMs > cutoff && (!m.channel || handles.has(m.channel.toLowerCase())));
  } catch {
    return [];
  }
}

/** Persists the recent merged buffer so a reload doesn't wipe chat (the competitor needs Postgres for this). */
function HistoryPersist() {
  const { isDemo } = useDemoMode();
  const { messages } = useFeedContext();
  const ref = useRef({ messages, isDemo });
  ref.current = { messages, isDemo };
  useEffect(() => {
    const id = setInterval(() => {
      const cur = ref.current;
      if (cur.isDemo || cur.messages.length === 0) return;
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(cur.messages.slice(-HISTORY_KEEP)));
      } catch {
        /* quota — skip */
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);
  return null;
}

function FeedBridge({ children }: { children: ReactNode }) {
  const { isDemo } = useDemoMode();
  const { streamers, selectedId, mergeAll } = useChannel();

  const selected = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const liveStreamers = streamers.filter((s) => s.live);
  const sources = mergeAll ? liveStreamers : selected ? [selected] : [];

  const makeProviders = () => [
    ...sources.flatMap((s) => [
      ...(s.handles.twitch ? [createTwitchIRCProvider({ channel: s.handles.twitch })] : []),
      ...(s.handles.kick ? [createKickProvider({ slug: s.handles.kick })] : []),
    ]),
    ...(isDemo ? [] : [createXChatProvider()]),
  ];

  // This key encodes the active source set so connections rebuild only when that set changes,
  // without remounting the subtree (which would reset UI state like sidebar expansion).
  const sourceKey = mergeAll
    ? `all:${liveStreamers.map((s) => s.id).sort().join(",")}`
    : selectedId;
  const feedKey = `${isDemo ? "demo" : "live"}:${sourceKey}`;

  return (
    <FeedProvider
      providersKey={feedKey}
      makeProviders={makeProviders}
      seedMessages={isDemo ? undefined : () => loadChatHistory(sources)}
    >
      <HistoryPersist />
      {children}
    </FeedProvider>
  );
}

/**
 * When the roster polls back fully offline, nudge first-time visitors toward Demo mode so the
 * dashboard never reads as dead. Session-dismissed; never shown while someone is live.
 */
function DemoNudge() {
  const { isDemo, toggle } = useDemoMode();
  const { streamers, polled } = useChannel();
  const demoOn = useFlag("demo");
  const [dismissed, setDismissed] = useState(true);

  // Operator kill switch: if demo gets disabled live while someone is in demo, snap back to live.
  useEffect(() => {
    if (!demoOn && isDemo) toggle();
  }, [demoOn, isDemo, toggle]);
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem("mb-demo-nudge") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("mb-demo-nudge", "1");
    } catch {}
  };

  const show = DEMO_ENABLED && demoOn && !isDemo && polled && !dismissed && streamers.every((s) => !s.live);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-x-0 bottom-6 z-[80] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-white/12 bg-[#1b1b1f] py-2.5 pl-3.5 pr-2 shadow-[0_18px_46px_-18px_rgba(0,0,0,0.85)]"
        >
          <Clapperboard className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 leading-tight">
            <p className="text-[0.8rem] font-medium text-foreground">Nobody&apos;s live right now</p>
            <p className="text-[0.68rem] text-muted-foreground">See the dashboard in action with busy demo channels</p>
          </div>
          <button
            type="button"
            onClick={() => {
              dismiss();
              toggle();
            }}
            className="ml-1 inline-flex h-7 flex-none items-center rounded-lg bg-foreground px-2.5 text-[0.72rem] font-semibold text-background transition-opacity hover:opacity-90"
          >
            Try Demo
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.07] hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Feeds the assistant's session-only in-memory archive while the opt-in is on. Renders nothing;
 * lives inside FeedBridge so it sees the merged feed regardless of which panels are open.
 */
function AssistantArchiveBridge() {
  const { settings } = useSettings();
  const { messages } = useFeedContext();
  useEffect(() => {
    setArchiveEnabled(AI_ENABLED && settings.assistantOptIn);
  }, [settings.assistantOptIn]);
  useEffect(() => {
    setArchiveLimit(settings.assistantArchiveSize);
  }, [settings.assistantArchiveSize]);
  useEffect(() => {
    archiveMessages(messages);
  }, [messages]);
  return null;
}

/** Collects mention-inbox matches from the merged feed, even while the panel is closed. */
function MentionBridge() {
  const { settings } = useSettings();
  const { messages } = useFeedContext();
  useEffect(() => {
    setMentionNames(settings.mentionNames);
  }, [settings.mentionNames]);
  useEffect(() => {
    collectMentions(messages);
  }, [messages]);
  return null;
}

// dockview touches the DOM on mount, so the workspace is client-only (desktop only).
const DockShell = dynamic(() => import("./dock-shell").then((m) => m.DockShell), {
  ssr: false,
  // Blank fallback (no text) — the preloader covers the initial load.
  loading: () => <div className="h-full w-full" />,
});

export function DashboardShell() {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Opened from the bottom nav on another page (Channels → /?channels=1).
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("channels") !== "1") return;
    setSheetOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("channels");
    window.history.replaceState({}, "", url.pathname + url.search);
  }, []);

  return (
    <DemoModeProvider>
      <SettingsProvider>
      <TickersProvider>
        <ChannelProvider>
          <FeedBridge>
            <AssistantArchiveBridge />
            <MentionBridge />
            <StageModeProvider>
              {isMobile ? (
                <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
                  <AnnouncementBanner />
                  <PollCard />
                  <StatBand />
                  <Marquee />
                  <MobileWorkspace />
                  {/* reserve space for the fixed bottom nav */}
                  <div className="h-[calc(3.5rem+env(safe-area-inset-bottom))] flex-none" aria-hidden />
                  <BottomNav onOpenChannels={() => setSheetOpen(true)} />
                  <StreamerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
                </div>
              ) : (
                <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
                  <TopNav />
                  <AnnouncementBanner />
                  <PollCard />
                  <StatBand />
                  <Marquee />
                  <div className="flex min-h-0 flex-1">
                    <Sidebar />
                    <main className="min-w-0 flex-1">
                      <DockShell />
                    </main>
                  </div>
                </div>
              )}
              {/* Broadcast overlay; sits above the running dashboard, nothing remounts. */}
              <StageOverlay />
              {/* Ctrl/Cmd+K — invisible until summoned (desktop only). */}
              <CommandPalette />
              {/* Offline-roster nudge toward Demo mode. */}
              <DemoNudge />
            </StageModeProvider>
          </FeedBridge>
        </ChannelProvider>
      </TickersProvider>
      </SettingsProvider>
    </DemoModeProvider>
  );
}

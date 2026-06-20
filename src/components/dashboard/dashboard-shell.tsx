"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowUpRight, Clapperboard, X } from "lucide-react";

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
import { useIsMobile, usePhoneLandscape } from "@/lib/use-is-mobile";
import { HighlightsBridge } from "./highlights-bridge";
import { StageOverlay } from "./stage-overlay";
import { TheaterOverlay } from "./theater-overlay";
import { TVOverlay } from "./tv-overlay";
import { AnnouncementBanner } from "./announcement-banner";
import { MobileThemeChip } from "@/components/theme-toggle";
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
 * In merge mode the feed unifies every roster channel into one stream (each row keeps its source);
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
  // Twitch and Kick both deliver chat while the channel is offline, so merge mode joins every
  // roster channel — offline ones are just quiet until they go live. This also keeps the
  // connection set stable across live/offline transitions (no reconnect churn).
  const sources = mergeAll ? streamers : selected ? [selected] : [];

  // X broadcast accounts among the active sources. Use each channel's xBroadcasts (the host's handle
  // plus any shared show account like MarketBubble) — that's the account actually broadcasting, not
  // necessarily handles.x. The provider pings /api/x/watch for these so the server reads the live
  // broadcast on demand (alongside the extension + boot bridge). In demo too, for X-only channels.
  const xWatch = Array.from(
    new Set(sources.flatMap((s) => (s.xBroadcasts?.length ? s.xBroadcasts : s.handles.x ? [s.handles.x] : []))),
  );

  const makeProviders = () => [
    ...sources.flatMap((s) => [
      ...(s.handles.twitch ? [createTwitchIRCProvider({ channel: s.handles.twitch })] : []),
      ...(s.handles.kick ? [createKickProvider({ slug: s.handles.kick })] : []),
    ]),
    ...(xWatch.length > 0 ? [createXChatProvider({ watch: xWatch })] : []),
  ];

  // This key encodes the active source set so connections rebuild only when that set changes,
  // without remounting the subtree (which would reset UI state like sidebar expansion).
  const sourceKey = mergeAll
    ? `all:${sources.map((s) => s.id).sort().join(",")}`
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
function DemoNudge({ showcaseEnabled }: { showcaseEnabled: boolean }) {
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
          className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[45] mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-hairline-strong bg-card py-2.5 pl-3.5 pr-2 shadow-[var(--shadow-card)] md:bottom-6"
        >
          <Clapperboard className="size-4 flex-none text-muted-foreground" />
          <div className="min-w-0 leading-tight">
            <p className="text-[0.8rem] font-medium text-foreground">Nobody&apos;s live right now</p>
            <p className="text-[0.68rem] text-muted-foreground">See the dashboard in action with busy demo channels</p>
          </div>
          {/* Stack the CTAs vertically on narrow screens so the pill doesn't overflow. */}
          <div className="ml-1 flex flex-none flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
            <button
              type="button"
              onClick={() => {
                dismiss();
                toggle();
              }}
              className="inline-flex h-7 w-full items-center justify-center rounded-lg bg-foreground px-2.5 text-[0.72rem] font-semibold text-background transition-opacity hover:opacity-90 sm:w-auto"
            >
              Try Demo
            </button>
            {showcaseEnabled ? (
              <a
                href="/showcase"
                target="_blank"
                rel="noopener noreferrer"
                className="mb-beam-button group inline-flex h-7 w-full items-center justify-center gap-1 rounded-lg bg-feed-warn/10 px-2.5 text-[0.72rem] font-semibold text-feed-warn transition-colors hover:bg-feed-warn/15 sm:w-auto"
              >
                <span>Showcase</span>
                <ArrowUpRight className="size-3 transition-transform duration-200 group-hover:-translate-y-[1px] group-hover:translate-x-[1px]" />
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex size-6 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-overlay-medium hover:text-foreground"
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

/**
 * Fires a browser notification when a roster channel flips offline → live. The first polled
 * snapshot is a silent baseline (page load shouldn't announce channels that were already live),
 * and demo mode never notifies. Clicking the notification focuses the tab on that channel.
 */
function LiveNotificationsBridge() {
  const { settings } = useSettings();
  const { isDemo } = useDemoMode();
  const { streamers, polled, select } = useChannel();

  const baseline = useRef<Set<string> | null>(null);
  const rosterKey = streamers.map((s) => s.id).join(",");
  useEffect(() => {
    baseline.current = null;
  }, [rosterKey]);

  useEffect(() => {
    if (!polled) return;
    const liveIds = new Set(streamers.filter((s) => s.live).map((s) => s.id));
    const prev = baseline.current;
    baseline.current = liveIds;
    if (prev === null) return; // first real snapshot — record, don't announce
    if (isDemo || !settings.liveNotifications) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    for (const s of streamers) {
      if (!s.live || prev.has(s.id)) continue;
      const n = new Notification(`${s.name} is live`, {
        body: s.title || "Streaming now — watch on Market Bubble",
        icon: "/web-app-manifest-192x192.png",
        tag: `mb-live-${s.id}`,
      });
      n.onclick = () => {
        window.focus();
        select(s.id);
        n.close();
      };
    }
  }, [polled, streamers, isDemo, settings.liveNotifications, select]);

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

/**
 * Applies the Animations setting app-wide: framer-motion goes instant via MotionConfig, and a
 * root attribute lets globals.css zero out CSS transitions/keyframes. "user" respects the OS
 * reduced-motion preference when the toggle is on.
 */
function MotionPrefs({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  useEffect(() => {
    document.documentElement.toggleAttribute("data-no-anim", !settings.animations);
  }, [settings.animations]);
  return <MotionConfig reducedMotion={settings.animations ? "user" : "always"}>{children}</MotionConfig>;
}

/** BottomNav with the live-channel badge on the Channels bubble; needs ChannelContext, so it sits below the provider. */
function MobileBottomNav({ onOpenChannels }: { onOpenChannels: () => void }) {
  const { streamers } = useChannel();
  return <BottomNav onOpenChannels={onOpenChannels} liveCount={streamers.filter((s) => s.live).length} />;
}

/**
 * Mobile chrome + workspace. Rotating a live stream to landscape enters theater: fullscreen
 * player with the chat overlay, all other chrome hidden. Rotating back restores everything.
 */
function MobileShell({ sheetOpen, setSheetOpen }: { sheetOpen: boolean; setSheetOpen: (open: boolean) => void }) {
  const phoneLandscape = usePhoneLandscape();
  const { streamers, selectedId } = useChannel();
  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];
  const theater = phoneLandscape && Boolean(channel?.live);

  return (
    <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
      {!theater ? (
        <>
          <AnnouncementBanner />
          <PollCard />
          <StatBand />
          {/* Marquee deliberately omitted on mobile — too crowded; markets live on the dedicated
              /markets route. Desktop still mounts it below in the wide-screen branch. */}
        </>
      ) : null}
      <MobileWorkspace theater={theater} />
      {!theater ? (
        <>
          {/* reserve space for the fixed bottom nav */}
          <div className="h-[calc(3.5rem+env(safe-area-inset-bottom))] flex-none" aria-hidden />
          <MobileBottomNav onOpenChannels={() => setSheetOpen(true)} />
        </>
      ) : null}
      {/* StreamerSheet is mounted in DashboardShell (a sibling of MobileShell) so its `z-50` is
          evaluated in the same stacking context as the DemoNudge — otherwise this container's
          `relative z-10` would trap the sheet's z-index below the nudge. */}
      {/* Floating theme toggle — hidden in landscape "theater" view, which would otherwise
          overlap the stream player's top edge. */}
      {!theater ? <MobileThemeChip /> : null}
    </div>
  );
}

// dockview touches the DOM on mount, so the workspace is client-only (desktop only).
const DockShell = dynamic(() => import("./dock-shell").then((m) => m.DockShell), {
  ssr: false,
  // Blank fallback (no text) — the preloader covers the initial load.
  loading: () => <div className="h-full w-full" />,
});

export function DashboardShell({ showcaseEnabled }: { showcaseEnabled: boolean }) {
  const isMobile = useIsMobile();
  // A rotated phone is wider than the mobile breakpoint; without this it would mount the desktop dockview.
  const phoneLandscape = usePhoneLandscape();
  const mobile = isMobile || phoneLandscape;
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
      <MotionPrefs>
      <TickersProvider>
        <ChannelProvider>
          <FeedBridge>
            <AssistantArchiveBridge />
            <MentionBridge />
            <HighlightsBridge />
            <LiveNotificationsBridge />
            <StageModeProvider>
              {mobile ? (
                <MobileShell sheetOpen={sheetOpen} setSheetOpen={setSheetOpen} />
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
              {/* View-mode overlays sit above the running dashboard; only one is open at a time and
                  the dock keeps its single player suppressed while any of them are active. */}
              <StageOverlay />
              <TheaterOverlay />
              <TVOverlay />
              {/* Ctrl/Cmd+K — invisible until summoned (desktop only). */}
              <CommandPalette />
              {/* Offline-roster nudge toward Demo mode. */}
              <DemoNudge showcaseEnabled={showcaseEnabled} />
              {/* Channel sheet (mobile only). Mounted at the outer level so its z-50 isn't trapped
                  beneath the DemoNudge by MobileShell's `relative z-10` stacking context. */}
              {mobile ? (
                <StreamerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
              ) : null}
            </StageModeProvider>
          </FeedBridge>
        </ChannelProvider>
      </TickersProvider>
      </MotionPrefs>
      </SettingsProvider>
    </DemoModeProvider>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";

import { FeedProvider } from "@/lib/chat/feed-context";
import { createMockProvider } from "@/lib/chat/providers/mock";
import { createKickProvider } from "@/lib/chat/providers/kick-pusher";
import { createTwitchIRCProvider } from "@/lib/chat/providers/twitch-irc";
import { createXChatProvider } from "@/lib/chat/providers/x-chat";
import { useDemoMode, DemoModeProvider } from "@/lib/demo-mode-context";
import { TickersProvider } from "@/lib/markets/tickers-context";
import { ChannelProvider, useChannel } from "@/lib/streamers/channel-context";
import { useIsMobile } from "@/lib/use-is-mobile";
import { BottomNav } from "./bottom-nav";
import { Marquee } from "./marquee";
import { MobileWorkspace } from "./mobile-workspace";
import { Sidebar } from "./sidebar";
import { StatBand } from "./stat-band";
import { StreamerSheet } from "./streamer-sheet";
import { TopNav } from "./top-nav";

const makeDemo = () => [createMockProvider()];

/**
 * Rebuilds providers whenever the selected channel or demo mode changes.
 * Re-keying FeedProvider tears down old WebSocket connections and opens fresh ones.
 */
function FeedBridge({ children }: { children: ReactNode }) {
  const { isDemo } = useDemoMode();
  const { streamers, selectedId } = useChannel();

  const channel = streamers.find((s) => s.id === selectedId) ?? streamers[0];

  const makeLive = () => [
    ...(channel?.handles.twitch ? [createTwitchIRCProvider({ channel: channel.handles.twitch })] : []),
    ...(channel?.handles.kick ? [createKickProvider({ slug: channel.handles.kick })] : []),
    createXChatProvider(),
  ];

  return (
    <FeedProvider key={isDemo ? "demo" : selectedId} makeProviders={isDemo ? makeDemo : makeLive}>
      {children}
    </FeedProvider>
  );
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
      <TickersProvider>
        <ChannelProvider>
          <FeedBridge>
            {isMobile ? (
              <div className="relative z-10 flex h-[100dvh] flex-col overflow-hidden">
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
          </FeedBridge>
        </ChannelProvider>
      </TickersProvider>
    </DemoModeProvider>
  );
}

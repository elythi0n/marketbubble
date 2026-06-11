"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";

import { setDockApi } from "@/lib/dock-api";
import { ChannelChatPane, type ChannelChatParams } from "./channel-chat-pane";
import { ChatPane } from "./chat-pane";
import { DockTab } from "./dock-tab";
import { GiftsPane } from "./gifts-pane";
import { HeaderActions } from "./header-actions";
import { StreamPane } from "./stream-pane";

// Optional panes load on demand — they're tabs, not part of the first paint, so keeping them out
// of the dock's initial chunk makes the workspace interactive sooner.
const paneLoading = () => <div className="h-full w-full bg-card" />;
const MarketsPane = dynamic(() => import("./markets-pane").then((m) => m.MarketsPane), { ssr: false, loading: paneLoading });
const NewsPane = dynamic(() => import("./news-pane").then((m) => m.NewsPane), { ssr: false, loading: paneLoading });
const PredictionsPane = dynamic(() => import("./predictions-pane").then((m) => m.PredictionsPane), { ssr: false, loading: paneLoading });
const XMentionsPane = dynamic(() => import("./x-mentions-pane").then((m) => m.XMentionsPane), { ssr: false, loading: paneLoading });
const HyperliquidPane = dynamic(() => import("./hyperliquid-pane").then((m) => m.HyperliquidPane), { ssr: false, loading: paneLoading });
const HypeMeterPane = dynamic(() => import("./hype-meter-pane").then((m) => m.HypeMeterPane), { ssr: false, loading: paneLoading });
const CashtagTrendsPane = dynamic(() => import("./cashtag-trends-pane").then((m) => m.CashtagTrendsPane), { ssr: false, loading: paneLoading });
const ChattersPane = dynamic(() => import("./chatters-pane").then((m) => m.ChattersPane), { ssr: false, loading: paneLoading });
const HighlightsPane = dynamic(() => import("./highlights-pane").then((m) => m.HighlightsPane), { ssr: false, loading: paneLoading });
const SettingsPane = dynamic(() => import("./settings-pane").then((m) => m.SettingsPane), { ssr: false, loading: paneLoading });
// Lazy so the Anthropic SDK only loads when the panel is opened (and not at all when disabled).
const AssistantPane = dynamic(() => import("./assistant-pane").then((m) => m.AssistantPane), { ssr: false, loading: paneLoading });
const MentionInboxPane = dynamic(() => import("./mention-inbox-pane").then((m) => m.MentionInboxPane), { ssr: false, loading: paneLoading });

const STORAGE_KEY = "mb-dock-layout-v2";

const REQUIRED_PANELS = ["stream", "chat", "gifts"] as const;

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  stream: () => <StreamPane />,
  chat: () => <ChatPane />,
  gifts: () => <GiftsPane />,
  markets: () => <MarketsPane />,
  news: () => <NewsPane />,
  predictions: () => <PredictionsPane />,
  mentions: () => <XMentionsPane />,
  hyperliquid: () => <HyperliquidPane />,
  hype: () => <HypeMeterPane />,
  trends: () => <CashtagTrendsPane />,
  chatters: () => <ChattersPane />,
  highlights: () => <HighlightsPane />,
  settings: () => <SettingsPane />,
  assistant: () => <AssistantPane />,
  inbox: () => <MentionInboxPane />,
  "channel-chat": (props) => {
    const params = props.params as ChannelChatParams | undefined;
    return params?.streamerId ? <ChannelChatPane {...params} /> : null;
  },
};

function buildDefault(api: DockviewApi) {
  api.addPanel({ id: "stream", component: "stream", title: "Stream" });
  const chat = api.addPanel({
    id: "chat",
    component: "chat",
    title: "Chat",
    position: { referencePanel: "stream", direction: "right" },
  });
  chat.group.api.setSize({ width: 384 });
  api.addPanel({
    id: "gifts",
    component: "gifts",
    title: "Gifts",
    position: { referenceGroup: chat.group, direction: "within" },
  });
  api.addPanel({
    id: "news",
    component: "news",
    title: "Market News",
    position: { referenceGroup: chat.group, direction: "within" },
  });
  chat.api.setActive();
}

function persist(api: DockviewApi) {
  // Never save an empty layout — protects against saves during teardown.
  if (api.panels.length === 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
  } catch {}
}

/** Wire persistence listeners. Returns a cleanup function that must be called on unmount. */
function wirePersistence(api: DockviewApi): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(api), 400);
  };

  const subscription = api.onDidLayoutChange(scheduleSave);
  window.addEventListener("mouseup", scheduleSave, { passive: true });

  return () => {
    subscription.dispose();
    if (saveTimer) clearTimeout(saveTimer);
    window.removeEventListener("mouseup", scheduleSave);
  };
}

export function DockShell() {
  const cleanupRef = useRef<(() => void) | null>(null);

  // Remove persistence listeners when the workspace unmounts (e.g. navigating away).
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setDockApi(null);
    };
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;
    setDockApi(api);

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        api.fromJSON(JSON.parse(raw));
        // Validate that every required panel survived the restore.
        const ids = new Set(api.panels.map((p) => p.id));
        if (REQUIRED_PANELS.every((id) => ids.has(id))) {
          cleanupRef.current = wirePersistence(api);
          return;
        }
      } catch {}

      // Saved state was corrupt or is missing required panels — clear and rebuild.
      localStorage.removeItem(STORAGE_KEY);
      [...api.panels].forEach((p) => api.removePanel(p));
    }

    buildDefault(api);
    persist(api);
    cleanupRef.current = wirePersistence(api);
  }, []);

  return (
    <DockviewReact
      className="mb-dock dockview-theme-dark h-full w-full"
      components={components}
      defaultTabComponent={DockTab}
      rightHeaderActionsComponent={HeaderActions}
      onReady={onReady}
    />
  );
}

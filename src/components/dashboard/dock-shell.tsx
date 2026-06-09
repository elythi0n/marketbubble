"use client";

import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";

import { ChatPane } from "./chat-pane";
import { DockTab } from "./dock-tab";
import { GiftsPane } from "./gifts-pane";
import { HeaderActions } from "./header-actions";
import { HyperliquidPane } from "./hyperliquid-pane";
import { MarketsPane } from "./markets-pane";
import { NewsPane } from "./news-pane";
import { PredictionsPane } from "./predictions-pane";
import { StreamPane } from "./stream-pane";
import { XMentionsPane } from "./x-mentions-pane";

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
    };
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;

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

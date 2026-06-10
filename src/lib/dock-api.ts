"use client";

import type { DockviewApi } from "dockview";

import { PLATFORM_LABEL, type Platform } from "@/lib/feed/types";

/**
 * The workspace's dockview API, registered by DockShell on mount. Lets components that live
 * outside the dock (sidebar, context menus) open panels. Null on mobile / before mount.
 */
let dockApi: DockviewApi | null = null;

export function setDockApi(api: DockviewApi | null) {
  dockApi = api;
}

export function hasDock(): boolean {
  return dockApi !== null;
}

/** Opens (or focuses) a registered panel by its component id (markets, news, settings, …). */
export function openPanel(id: string, title: string): void {
  const api = dockApi;
  if (!api) return;
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  api.addPanel({
    id,
    component: id,
    title,
    position: api.getPanel("chat") ? { referencePanel: "chat", direction: "within" } : undefined,
  });
}

/** Opens (or focuses) a dedicated chat panel for one streamer, optionally scoped to a platform. */
export function openChannelChat(streamer: { id: string; name: string }, platform?: Platform): void {
  const api = dockApi;
  if (!api) return;
  const id = platform ? `chat-${streamer.id}-${platform}` : `chat-${streamer.id}`;
  const existing = api.getPanel(id);
  if (existing) {
    existing.api.setActive();
    return;
  }
  api.addPanel({
    id,
    component: "channel-chat",
    title: platform ? `${streamer.name} · ${PLATFORM_LABEL[platform]}` : `${streamer.name} · Chat`,
    params: { streamerId: streamer.id, platform },
    // Land next to the main chat as a tab; fall back to dockview's default placement.
    position: api.getPanel("chat") ? { referencePanel: "chat", direction: "within" } : undefined,
  });
}

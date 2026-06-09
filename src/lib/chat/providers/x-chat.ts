"use client";

import { parseSegments } from "@/lib/feed/segments";
import type { FeedMessage } from "@/lib/feed/types";
import type { XChatMessage } from "@/lib/x/chat-buffer";
import type { ChatProvider, ChatSink, ProviderHandle } from "../provider";

const POLL_MS = 2500;

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function toFeedMessage(msg: XChatMessage): FeedMessage {
  const tsMs = new Date(msg.timestamp).getTime();
  return {
    id: `x:${msg.id}`,
    platform: "x",
    type: "chat",
    author: msg.authorName || msg.authorHandle,
    badges: (msg.badges ?? []).map((b) => ({ set: b })),
    segments: parseSegments(msg.text),
    ts: formatClock(tsMs),
    tsMs,
    channel: msg.authorHandle,
  };
}

/**
 * Polls /api/x/chat and emits new messages into the unified feed.
 * Companion to the MarketBubble Chat Bridge browser extension which pushes
 * X livestream chat to that endpoint.
 */
export function createXChatProvider(): ChatProvider {
  return {
    id: "x:chat",
    start(sink: ChatSink): ProviderHandle {
      let stopped = false;
      let timerId: ReturnType<typeof setInterval> | null = null;
      // Track IDs already emitted this session so we don't re-emit on each poll.
      const emitted = new Set<string>();

      sink.status?.("connecting");

      const poll = async () => {
        if (stopped) return;
        try {
          const res = await fetch("/api/x/chat");
          if (!res.ok) { sink.status?.("error"); return; }
          const msgs = (await res.json()) as XChatMessage[];
          sink.status?.("open");
          for (const msg of msgs) {
            if (emitted.has(msg.id)) continue;
            emitted.add(msg.id);
            sink.message(toFeedMessage(msg));
          }
        } catch {
          sink.status?.("error");
        }
      };

      poll();
      timerId = setInterval(poll, POLL_MS);

      return {
        stop() {
          stopped = true;
          if (timerId) clearInterval(timerId);
        },
      };
    },
  };
}

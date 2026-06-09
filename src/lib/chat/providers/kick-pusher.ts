"use client";

import { parseSegments, type EmoteMeta } from "@/lib/feed/segments";
import type { Badge, Segment } from "@/lib/feed/types";
import { initKickBadges, getKickBadgeUrl } from "@/lib/badges/kick";
import { getEmoteRecord, initGlobalEmotes, initKickChannelEmotes } from "@/lib/emotes/registry";
import type { ChatProvider, ChatSink, ProviderHandle } from "../provider";

const PUSHER_URL =
  "wss://ws-us2.pusher.com/app/32cbd69e4b950bf97679?protocol=7&client=js&version=7.0.3&flash=false";

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Parse inline Kick emote tokens ([emote:123:emoteName]); the plain-text runs between them are run
 * through the 3rd-party emote registry (7TV global + the channel's 7TV set) just like Twitch.
 */
function parseKickContent(content: string, emotes: Record<string, EmoteMeta>): Segment[] {
  const EMOTE_RE = /\[emote:(\d+):([^\]]+)\]/g;
  const segments: Segment[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = EMOTE_RE.exec(content)) !== null) {
    if (match.index > last) {
      segments.push(...parseSegments(content.slice(last, match.index), emotes));
    }
    const [, id, name] = match;
    segments.push({
      type: "emote",
      code: name,
      url: `https://files.kick.com/emotes/${id}/fullsize`,
    });
    last = match.index + match[0].length;
  }

  if (last < content.length) segments.push(...parseSegments(content.slice(last), emotes));
  return segments;
}

interface KickBadge {
  type: string;
  text?: string;
  /** Months subscribed — used to resolve the correct subscriber badge tier image. */
  count?: number;
}

function mapKickBadges(raw: KickBadge[], slug: string): Badge[] {
  return raw.map((b) => ({
    set: b.type,
    title: b.text,
    url: getKickBadgeUrl(slug, b.type, b.count),
  }));
}

interface KickChatMessage {
  id: string;
  content: string;
  type: string;
  created_at: string;
  sender: {
    username: string;
    identity?: {
      color?: string;
      badges?: KickBadge[];
    };
  };
}

interface PusherEnvelope {
  event: string;
  data?: unknown;
  channel?: string;
}

export interface KickPusherConfig {
  slug: string;
}

export function createKickProvider(config: KickPusherConfig): ChatProvider {
  return {
    id: `kick:${config.slug}`,
    start(sink: ChatSink): ProviderHandle {
      let ws: WebSocket | null = null;
      let stopped = false;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectDelay = 2000;
      let chatroomId: number | null = null;
      const channelKey = `kick:${config.slug}`;

      const subscribe = () => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(
          JSON.stringify({
            event: "pusher:subscribe",
            data: { auth: "", channel: `chatrooms.${chatroomId}.v2` },
          }),
        );
      };

      const handleEnvelope = (env: PusherEnvelope) => {
        switch (env.event) {
          case "pusher:connection_established":
            reconnectDelay = 2000;
            subscribe();
            break;

          case "pusher_internal:subscription_succeeded":
            sink.status?.("open");
            break;

          case "pusher:ping":
            ws?.send(JSON.stringify({ event: "pusher:pong", data: {} }));
            break;

          case "App\\Events\\ChatMessageEvent": {
            const raw = typeof env.data === "string" ? env.data : JSON.stringify(env.data);
            let msg: KickChatMessage;
            try { msg = JSON.parse(raw); } catch { break; }
            if (msg.type !== "message") break;

            const tsMs = new Date(msg.created_at).getTime() || Date.now();

            sink.message({
              id: msg.id,
              platform: "kick",
              type: "chat",
              author: msg.sender.username,
              authorColor: msg.sender.identity?.color || undefined,
              badges: mapKickBadges(msg.sender.identity?.badges ?? [], config.slug),
              segments: parseKickContent(msg.content, getEmoteRecord(channelKey)),
              ts: formatClock(tsMs),
              tsMs,
              channel: config.slug,
            });
            break;
          }
        }
      };

      const openSocket = () => {
        if (stopped) return;
        ws = new WebSocket(PUSHER_URL);

        ws.onmessage = (ev) => {
          const text = typeof ev.data === "string" ? ev.data : "";
          try { handleEnvelope(JSON.parse(text) as PusherEnvelope); } catch {}
        };

        ws.onclose = () => {
          if (stopped) return;
          sink.status?.("closed");
          reconnectDelay = Math.min(reconnectDelay * 1.5, 30_000);
          reconnectTimer = setTimeout(connect, reconnectDelay);
        };

        ws.onerror = () => {
          sink.status?.("error");
          ws?.close();
        };
      };

      const connect = async () => {
        if (stopped) return;
        sink.status?.("connecting");

        if (chatroomId === null) {
          try {
            const res = await fetch(`/api/kick/channel?slug=${encodeURIComponent(config.slug)}`);
            if (!res.ok) throw new Error(`status ${res.status}`);
            const json = await res.json() as { chatroomId: number; userId?: number };
            chatroomId = json.chatroomId;
            // Third-party emotes: 7TV by Kick user id, plus the shared global sets. Non-blocking.
            initGlobalEmotes();
            if (json.userId) initKickChannelEmotes(String(json.userId), channelKey);
          } catch {
            if (!stopped) {
              sink.status?.("error");
              reconnectDelay = Math.min(reconnectDelay * 1.5, 60_000);
              reconnectTimer = setTimeout(connect, reconnectDelay);
            }
            return;
          }
        }

        // Pre-load badge images in the background; doesn't block connection.
        initKickBadges(config.slug);

        openSocket();
      };

      connect();

      return {
        stop() {
          stopped = true;
          if (reconnectTimer) clearTimeout(reconnectTimer);
          ws?.close();
        },
      };
    },
  };
}

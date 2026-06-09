"use client";

import { parseSegments } from "@/lib/feed/segments";
import type { Badge, FeedMessage, Segment } from "@/lib/feed/types";
import { initChannelBadges, initGlobalBadges, getTwitchBadgeUrl } from "@/lib/badges/twitch";
import { getEmoteRecord, initChannelEmotes, initGlobalEmotes } from "@/lib/emotes/registry";
import type { ChatProvider, ChatSink, ProviderHandle } from "../provider";

const IRC_URL = "wss://irc-ws.chat.twitch.tv:443";

function randomJustinfan(): string {
  return `justinfan${80000 + Math.floor(Math.random() * 10000)}`;
}

function parseTags(raw: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    tags[part.slice(0, eq)] = part.slice(eq + 1).replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\");
  }
  return tags;
}

interface ParsedIRC {
  tags: Record<string, string>;
  prefix: string;
  command: string;
  params: string[];
  trailing: string;
}

function parseIRC(line: string): ParsedIRC | null {
  let pos = 0;
  const tags: Record<string, string> = {};
  let prefix = "";

  if (line[pos] === "@") {
    const sp = line.indexOf(" ", pos);
    if (sp < 0) return null;
    Object.assign(tags, parseTags(line.slice(1, sp)));
    pos = sp + 1;
  }
  if (line[pos] === ":") {
    const sp = line.indexOf(" ", pos);
    if (sp < 0) return null;
    prefix = line.slice(pos + 1, sp);
    pos = sp + 1;
  }

  const trailIdx = line.indexOf(" :", pos);
  const mainPart = trailIdx >= 0 ? line.slice(pos, trailIdx) : line.slice(pos);
  const trailing = trailIdx >= 0 ? line.slice(trailIdx + 2) : "";
  const parts = mainPart.trim().split(" ").filter(Boolean);

  return { tags, prefix, command: parts[0] ?? "", params: parts.slice(1), trailing };
}

/**
 * Parse the Twitch IRC emotes tag "25:0-4,12-16/1902:6-10" into segments.
 * Offsets are Unicode code point indices, not UTF-16 code unit indices.
 */
function parseTwitchEmoteTag(body: string, emoteTag: string): Segment[] {
  if (!emoteTag) return [{ type: "text", text: body }];

  const ranges: { id: string; start: number; end: number }[] = [];
  for (const entry of emoteTag.split("/")) {
    const colon = entry.indexOf(":");
    if (colon < 0) continue;
    const id = entry.slice(0, colon);
    for (const range of entry.slice(colon + 1).split(",")) {
      const [s, e] = range.split("-").map(Number);
      if (!isNaN(s) && !isNaN(e)) ranges.push({ id, start: s, end: e });
    }
  }
  if (!ranges.length) return [{ type: "text", text: body }];

  ranges.sort((a, b) => a.start - b.start);
  const codePoints = [...body];
  const segments: Segment[] = [];
  let cursor = 0;

  for (const { id, start, end } of ranges) {
    if (start > cursor) segments.push({ type: "text", text: codePoints.slice(cursor, start).join("") });
    const code = codePoints.slice(start, end + 1).join("");
    segments.push({
      type: "emote",
      code,
      url: `https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/dark/2.0`,
    });
    cursor = end + 1;
  }
  if (cursor < codePoints.length) segments.push({ type: "text", text: codePoints.slice(cursor).join("") });

  return segments;
}

/** Expand any remaining text segments through the 3rd-party emote registry. */
function enrichWithThirdParty(segments: Segment[], channelKey: string): Segment[] {
  const emotes = getEmoteRecord(channelKey);
  if (!Object.keys(emotes).length) return segments;
  const out: Segment[] = [];
  for (const seg of segments) {
    if (seg.type !== "text") { out.push(seg); continue; }
    out.push(...parseSegments(seg.text, emotes));
  }
  return out;
}

function resolveBadges(raw: string, channelId?: string): Badge[] {
  if (!raw) return [];
  return raw.split(",").map((b) => {
    const [set, version = "1"] = b.split("/");
    const safeSet = set ?? b;
    const url = getTwitchBadgeUrl(safeSet, version, channelId);
    return { set: safeSet, version, url };
  });
}

function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export interface TwitchIRCConfig {
  /** Twitch channel login (no leading #). */
  channel: string;
}

export function createTwitchIRCProvider(config: TwitchIRCConfig): ChatProvider {
  return {
    id: `twitch:${config.channel}`,
    start(sink: ChatSink): ProviderHandle {
      let ws: WebSocket | null = null;
      let stopped = false;
      let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
      let reconnectDelay = 1500;
      let roomId: string | null = null;
      const channelKey = `twitch:${config.channel}`;

      initGlobalEmotes();
      initGlobalBadges();

      const connect = () => {
        if (stopped) return;
        sink.status?.("connecting");
        ws = new WebSocket(IRC_URL);

        ws.onopen = () => {
          ws!.send("CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership");
          ws!.send(`NICK ${randomJustinfan()}`);
          ws!.send(`JOIN #${config.channel}`);
        };

        ws.onmessage = (ev) => {
          const text = typeof ev.data === "string" ? ev.data : "";
          for (const line of text.split("\r\n")) {
            if (line.trim()) handleLine(line);
          }
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

      const handleLine = (line: string) => {
        if (line.startsWith("PING ")) {
          ws!.send(`PONG ${line.slice(5)}`);
          return;
        }
        const msg = parseIRC(line);
        if (!msg) return;

        switch (msg.command) {
          case "001":
            reconnectDelay = 1500;
            sink.status?.("open");
            break;

          case "PRIVMSG": {
            const { tags, prefix, trailing: body } = msg;
            const tsMs = Number(tags["tmi-sent-ts"]) || Date.now();

            if (!roomId && tags["room-id"]) {
              roomId = tags["room-id"];
              initChannelBadges(roomId);
              initChannelEmotes(roomId, channelKey);
            }

            let actualBody = body;
            let type: FeedMessage["type"] = "chat";
            if (body.startsWith("\x01ACTION ") && body.endsWith("\x01")) {
              actualBody = body.slice(8, -1);
              type = "action";
            }

            let segments = parseTwitchEmoteTag(actualBody, tags["emotes"] ?? "");
            segments = enrichWithThirdParty(segments, channelKey);

            const displayName = tags["display-name"] || prefix.split("!")[0] || "unknown";
            const badges = resolveBadges(tags["badges"] ?? "", roomId ?? undefined);
            const msgId = tags["msg-id"];

            const feedMsg: FeedMessage = {
              id: tags["id"] || `twitch-${tsMs}-${Math.random().toString(36).slice(2, 7)}`,
              platform: "twitch",
              type,
              author: displayName,
              authorColor: tags["color"] || undefined,
              badges,
              segments,
              ts: formatClock(tsMs),
              tsMs,
              channel: config.channel,
              highlighted: msgId === "highlighted-message",
            };

            if (tags["reply-parent-display-name"] && tags["reply-parent-msg-body"]) {
              feedMsg.replyTo = {
                author: tags["reply-parent-display-name"],
                snippet: tags["reply-parent-msg-body"].slice(0, 60),
              };
              feedMsg.type = "reply";
            }

            sink.message(feedMsg);
            break;
          }

          case "USERNOTICE": {
            const { tags, trailing } = msg;
            const tsMs = Number(tags["tmi-sent-ts"]) || Date.now();
            const msgId = tags["msg-id"] ?? "";
            const displayName = tags["display-name"] || tags["login"] || "unknown";

            const typeMap: Record<string, FeedMessage["type"]> = {
              sub: "sub",
              resub: "resub",
              subgift: "giftsub",
              submysterygift: "giftsub",
              raid: "raid",
              announcement: "announcement",
            };

            sink.message({
              id: tags["id"] || `twitch-notice-${tsMs}-${Math.random().toString(36).slice(2, 6)}`,
              platform: "twitch",
              type: typeMap[msgId] ?? "system",
              author: displayName,
              authorColor: tags["color"] || undefined,
              badges: resolveBadges(tags["badges"] ?? "", roomId ?? undefined),
              segments: trailing ? parseTwitchEmoteTag(trailing, tags["emotes"] ?? "") : [],
              ts: formatClock(tsMs),
              tsMs,
              channel: config.channel,
              event: {
                months: Number(tags["msg-param-cumulative-months"]) || undefined,
                count: Number(tags["msg-param-mass-gift-count"]) || undefined,
                viewers: Number(tags["msg-param-viewerCount"]) || undefined,
                tier: tags["msg-param-sub-plan"],
              },
            });
            break;
          }
        }
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

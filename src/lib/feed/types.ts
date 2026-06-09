/**
 * Normalized chat model shared by every provider (Twitch, Kick, X, and future sources).
 * Each platform adapter converts its raw payload into a `FeedMessage`, so the feed UI and the
 * aggregator never need to know which network a line came from.
 */

export type Platform = "twitch" | "kick" | "x";

export const PLATFORMS: Platform[] = ["twitch", "kick", "x"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  twitch: "Twitch",
  kick: "Kick",
  x: "X",
};

/** A parsed run inside a message body. */
export type Segment =
  | { type: "text"; text: string }
  | { type: "emote"; code: string; url: string }
  | { type: "mention"; user: string }
  | { type: "cashtag"; symbol: string }
  | { type: "link"; href: string; text: string };

/** Well-known badge sets get a label + semantic color; unknown sets fall back to a short tag. */
export type BadgeSet =
  | "broadcaster"
  | "moderator"
  | "subscriber"
  | "founder"
  | "vip"
  | "staff"
  | "verified"
  | "premium"
  | "artist";

export interface Badge {
  /** Badge identity (e.g. "moderator"); unknown values render as a 3-letter tag. */
  set: BadgeSet | string;
  /** Accessible title / tooltip. */
  title?: string;
  /** Optional image badge (Twitch/Kick CDN). When absent, a text chip is shown. */
  url?: string;
}

export type MessageType =
  | "chat"
  | "action"
  | "reply"
  | "sub"
  | "resub"
  | "giftsub"
  | "raid"
  | "host"
  | "follow"
  | "announcement"
  | "moderation"
  | "system";

/** Event types render as a colored band rather than a normal chat row. */
export const EVENT_TYPES = new Set<MessageType>([
  "sub",
  "resub",
  "giftsub",
  "raid",
  "host",
  "follow",
  "announcement",
  "moderation",
  "system",
]);

export const EVENT_LABEL: Record<string, string> = {
  sub: "SUB",
  resub: "RESUB",
  giftsub: "GIFT",
  raid: "RAID",
  host: "HOST",
  follow: "FOLLOW",
  announcement: "ANNOUNCEMENT",
  moderation: "MOD",
  system: "SYSTEM",
};

export interface FeedMessage {
  id: string;
  platform: Platform;
  type?: MessageType;
  /** Display name. */
  author: string;
  /** Author name color (hex). Clamped for contrast at render time. */
  authorColor?: string;
  badges?: Badge[];
  /** Parsed body. Empty for event-only lines. */
  segments: Segment[];
  /** Preformatted clock, e.g. "14:32". */
  ts: string;
  /** Epoch ms; used for ordering across platforms. */
  tsMs: number;
  /** Source channel / handle the message arrived on. */
  channel?: string;
  /** Quoted parent when this is a reply / X thread reply. */
  replyTo?: { author: string; snippet: string };
  /** Magnitude metadata for event rows. */
  event?: { count?: number; viewers?: number; months?: number; tier?: string };
  /** Soft-deleted by a moderator. */
  deleted?: boolean;
  /** Matched a highlight rule. */
  highlighted?: boolean;
  /** Calm-mode collapse count for repeated identical lines. */
  combo?: number;
}

export function isEventType(type: MessageType | undefined): boolean {
  return type != null && EVENT_TYPES.has(type);
}

import type { Platform } from "@/lib/feed/types";
import type { StreamSchedule } from "./schedule";

export interface Streamer {
  id: string;
  name: string;
  /** Per-platform handles. At least one entry required. */
  handles: Partial<Record<Platform, string>>;
  /** Platforms this creator broadcasts on; the unified feed merges all of them. */
  platforms: Platform[];
  live: boolean;
  viewers: number;
  title: string;
  /** Which platform is currently live. Drives embed selection; updated by useStreamers. */
  livePlatform?: Platform;
  /** Live stream thumbnail URL, filled by useStreamers from the platform API. */
  thumbnail?: string;
  /** Recurring slot, shown when the channel is offline. */
  schedule?: StreamSchedule;
  /** YouTube channel handle (without @), used to fetch recent videos as clip fallback. */
  youtube?: string;
  /**
   * X accounts whose live broadcasts feed this show's chat: each entry is an @handle or a
   * broadcast link. A streamer can list several (their own X plus a shared show account like
   * MarketBubble); the server bridge de-duplicates shared accounts across the roster.
   */
  xBroadcasts?: string[];
}

/** Returns the handle for a specific platform, falling back to the first defined handle. */
export function getHandle(s: Streamer, platform: Platform): string {
  return s.handles[platform] ?? (Object.values(s.handles).find(Boolean) as string) ?? s.id;
}

/** Primary platform for avatar/glyph/player decisions. */
export function primaryPlatform(s: Streamer): Platform {
  return s.platforms.find((p) => p !== "x") ?? s.platforms[0];
}

/** Whether the creator has a video platform (vs X-only). */
export function hasVideo(s: Streamer): boolean {
  return s.platforms.some((p) => p !== "x");
}

/**
 * Real profile picture, resolved by handle via unavatar.io (no API key; `fallback=false` returns 404
 * when nothing is found so we can drop back to initials).
 */
export function avatarUrl(s: Streamer): string | null {
  const p = primaryPlatform(s);
  const h = getHandle(s, p);
  if (p === "twitch") return `https://unavatar.io/twitch/${h}?fallback=false`;
  if (p === "x") return `https://unavatar.io/twitter/${h}?fallback=false`;
  if (p === "kick") return `/api/kick/avatar?slug=${encodeURIComponent(h)}`;
  return null;
}

// Both creators host the MarketBubble show; the per-stream title is filled from the platform later,
// so `title` is the brand placeholder for now. The slot is always THURSDAYS 1PM PST.
const SHOW_TITLE = "MarketBubble";
const SHOW_SCHEDULE = { label: "THURSDAYS 1PM PST", weekday: 4, hour: 13 } as const;

/** Channel roster. */
export const MOCK_STREAMERS: Streamer[] = [
  {
    id: "fazebanks",
    name: "FaZe Banks",
    handles: { twitch: "fazebanks", kick: "fazebanks", x: "FaZeBanks" },
    platforms: ["twitch", "kick", "x"],
    live: true,
    viewers: 32400,
    title: SHOW_TITLE,
    schedule: SHOW_SCHEDULE,
    youtube: "MarketBubble",
  },
  {
    id: "blknoiz06",
    name: "Blknoiz06",
    handles: { x: "Blknoiz06" },
    platforms: ["x"],
    live: false,
    viewers: 0,
    title: SHOW_TITLE,
    schedule: SHOW_SCHEDULE,
  },
];

import type { Platform } from "@/lib/feed/types";

export type ClipSource = Platform | "youtube";

export interface Clip {
  id: string;
  title: string;
  channel: string;
  platform: ClipSource;
  /** Short highlight, a full past broadcast (VOD), or an uploaded video. Drives how it's embedded. */
  kind?: "clip" | "vod" | "video";
  /** mm:ss or h:mm:ss, empty string when unknown */
  duration: string;
  views: number;
  thumbnail?: string;
  url?: string;
}

/** Placeholder recent clips for the offline stream panel. */
export const MOCK_CLIPS: Clip[] = [
  { id: "c1", title: "Banks breaks down the FaZe cap table", channel: "fazebanks", platform: "twitch", duration: "2:14", views: 18400 },
  { id: "c2", title: "Blknoiz06 calls the SOL reclaim live", channel: "Blknoiz06", platform: "x", duration: "0:48", views: 26800 },
  { id: "c3", title: "Turning a meme coin into a real position", channel: "fazebanks", platform: "kick", duration: "3:32", views: 51200 },
  { id: "c4", title: "Reading CT sentiment before the pump", channel: "Blknoiz06", platform: "x", duration: "5:07", views: 33100 },
  { id: "c5", title: "Macro print reaction — instant +5%", channel: "fazebanks", platform: "twitch", duration: "1:21", views: 7300 },
];

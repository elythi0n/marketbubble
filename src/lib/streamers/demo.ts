import type { Streamer } from "./mock";

/**
 * Curated demo roster: busy, well-known channels so the unified feed and the rest of the dashboard
 * look alive without depending on the show roster being live. Live status and viewer counts are
 * filled by useStreamers from the platform APIs; placeholders start offline until the first poll.
 * Kick slugs are lowercase and have cached chatroom ids in /api/kick/channel.
 */
export const DEMO_STREAMERS: Streamer[] = [
  {
    id: "harrie",
    name: "Harrie",
    handles: { twitch: "harrie" },
    platforms: ["twitch"],
    live: false,
    viewers: 0,
    title: "Just Chatting",
  },
  {
    id: "eslcs",
    name: "ESL CS",
    handles: { twitch: "eslcs", kick: "eslcs" },
    platforms: ["twitch", "kick"],
    live: false,
    viewers: 0,
    title: "CS2",
  },
  {
    id: "xqc",
    name: "xQc",
    handles: { twitch: "xqc", kick: "xqc" },
    platforms: ["twitch", "kick"],
    live: false,
    viewers: 0,
    title: "Variety",
  },
  {
    id: "odablock",
    name: "Odablock",
    handles: { kick: "odablock" },
    platforms: ["kick"],
    live: false,
    viewers: 0,
    title: "Old School RuneScape",
  },
  {
    id: "solomission",
    name: "SoloMission",
    handles: { kick: "solomission" },
    platforms: ["kick"],
    live: false,
    viewers: 0,
    title: "Old School RuneScape",
  },
];

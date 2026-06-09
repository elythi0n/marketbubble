import type { Streamer } from "./mock";

/**
 * Curated demo roster: busy, well-known channels so the unified feed and the rest of the dashboard
 * look alive without depending on the show roster being live. Marked live with plausible viewer
 * counts; the chat itself is real (Twitch IRC + Kick) for whichever of these is actually streaming.
 * Kick slugs are lowercase and have cached chatroom ids in /api/kick/channel.
 */
export const DEMO_STREAMERS: Streamer[] = [
  {
    id: "harrie",
    name: "Harrie",
    handles: { twitch: "harrie" },
    platforms: ["twitch"],
    live: true,
    viewers: 6200,
    title: "Just Chatting",
    livePlatform: "twitch",
  },
  {
    id: "eslcs",
    name: "ESL CS",
    handles: { twitch: "eslcs", kick: "eslcs" },
    platforms: ["twitch", "kick"],
    live: true,
    viewers: 24800,
    title: "CS2",
    livePlatform: "twitch",
  },
  {
    id: "xqc",
    name: "xQc",
    handles: { twitch: "xqc", kick: "xqc" },
    platforms: ["twitch", "kick"],
    live: true,
    viewers: 38400,
    title: "Variety",
    livePlatform: "kick",
  },
  {
    id: "odablock",
    name: "Odablock",
    handles: { kick: "odablock" },
    platforms: ["kick"],
    live: true,
    viewers: 9100,
    title: "Old School RuneScape",
    livePlatform: "kick",
  },
  {
    id: "solomission",
    name: "SoloMission",
    handles: { kick: "solomission" },
    platforms: ["kick"],
    live: true,
    viewers: 4300,
    title: "Old School RuneScape",
    livePlatform: "kick",
  },
];

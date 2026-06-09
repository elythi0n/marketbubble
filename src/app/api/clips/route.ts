import { type NextRequest, NextResponse } from "next/server";

import type { Clip } from "@/lib/streamers/clips";

export const revalidate = 600; // 10-minute cache

// ─── Helpers ─────────────────────────────────────────────────────────────────

function secondsToMMSS(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Twitch Helix clips ───────────────────────────────────────────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getTwitchToken(): Promise<string | null> {
  const id = process.env.TWITCH_CLIENT_ID;
  const secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 120_000) return cachedToken.value;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function fetchTwitchClips(login: string): Promise<Clip[] | null> {
  const token = await getTwitchToken();
  if (!token) return null;
  const clientId = process.env.TWITCH_CLIENT_ID!;

  // Resolve broadcaster_id
  const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, {
    headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
    next: { revalidate: 600 },
  });
  if (!userRes.ok) return null;
  const userData = (await userRes.json()) as { data: Array<{ id: string; display_name: string }> };
  const user = userData.data?.[0];
  if (!user) return null;

  // Fetch clips
  const clipsRes = await fetch(
    `https://api.twitch.tv/helix/clips?broadcaster_id=${user.id}&first=8`,
    {
      headers: { Authorization: `Bearer ${token}`, "Client-Id": clientId },
      next: { revalidate: 600 },
    },
  );
  if (!clipsRes.ok) return null;
  const clipsData = (await clipsRes.json()) as {
    data: Array<{ id: string; title: string; duration: number; view_count: number; thumbnail_url: string; url: string }>;
  };

  return clipsData.data.map((c) => ({
    id: c.id,
    title: c.title,
    channel: user.display_name,
    platform: "twitch" as const,
    duration: secondsToMMSS(c.duration),
    views: c.view_count,
    thumbnail: c.thumbnail_url.replace("{width}", "480").replace("{height}", "272"),
    url: c.url,
  }));
}

// ─── YouTube RSS fallback ─────────────────────────────────────────────────────

// Module-level cache: handle → channelId (persists across requests within the same worker lifetime)
const youtubeChannelIdCache = new Map<string, string>();

async function resolveYouTubeChannelId(handle: string): Promise<string | null> {
  if (youtubeChannelIdCache.has(handle)) return youtubeChannelIdCache.get(handle)!;
  try {
    const res = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Channel ID is embedded in several places; the canonical link is the most stable.
    const canonical = html.match(/rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/);
    const embedded = html.match(/"channelId":"(UC[\w-]{22})"/);
    const id = canonical?.[1] ?? embedded?.[1] ?? null;
    if (id) youtubeChannelIdCache.set(handle, id);
    return id;
  } catch {
    return null;
  }
}

function parseYouTubeFeed(xml: string, channelHandle: string): Clip[] {
  const clips: Clip[] = [];
  const entries = xml.split("<entry>");
  entries.shift(); // drop the feed header

  for (const entry of entries) {
    const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([^<]+)<\/title>/)?.[1];
    if (!videoId || !title) continue;

    // Decode XML entities in the title
    const decoded = title
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    clips.push({
      id: videoId,
      title: decoded,
      channel: channelHandle,
      platform: "youtube",
      duration: "",
      views: 0,
      thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    });
  }
  return clips.slice(0, 8);
}

async function fetchYouTubeVideos(handle: string): Promise<Clip[] | null> {
  const channelId = await resolveYouTubeChannelId(handle);
  if (!channelId) return null;
  try {
    const res = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 600 } },
    );
    if (!res.ok) return null;
    const xml = await res.text();
    const clips = parseYouTubeFeed(xml, handle);
    return clips.length > 0 ? clips : null;
  } catch {
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const login = req.nextUrl.searchParams.get("login");
  const youtube = req.nextUrl.searchParams.get("youtube");

  if (!login) return NextResponse.json([], { status: 400 });

  const twitchClips = await fetchTwitchClips(login);
  if (twitchClips && twitchClips.length > 0) return NextResponse.json(twitchClips);

  if (youtube) {
    const ytVideos = await fetchYouTubeVideos(youtube);
    if (ytVideos && ytVideos.length > 0) return NextResponse.json(ytVideos);
  }

  // Both sources failed — client falls back to mock
  return NextResponse.json([]);
}

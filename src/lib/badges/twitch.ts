"use client";

// key: "set/version" → image URL (2x)
const globalBadges = new Map<string, string>();
const channelBadges = new Map<string, Map<string, string>>();

export function getTwitchBadgeUrl(set: string, version: string, channelId?: string): string | undefined {
  const key = `${set}/${version}`;
  if (channelId) {
    const url = channelBadges.get(channelId)?.get(key);
    if (url) return url;
  }
  return globalBadges.get(key);
}

type BadgeVersions = Record<string, { image_url_2x: string; title?: string }>;
type BadgeSetsResponse = { badge_sets?: Record<string, { versions?: BadgeVersions }> };

function parseBadgeSets(data: BadgeSetsResponse, into: Map<string, string>): void {
  for (const [set, setData] of Object.entries(data.badge_sets ?? {})) {
    for (const [version, vData] of Object.entries(setData.versions ?? {})) {
      if (vData.image_url_2x) into.set(`${set}/${version}`, vData.image_url_2x);
    }
  }
}

let globalFetched = false;

export async function initGlobalBadges(): Promise<void> {
  if (globalFetched) return;
  globalFetched = true;
  try {
    const res = await fetch("/api/twitch/badges");
    if (!res.ok) return;
    parseBadgeSets(await res.json(), globalBadges);
  } catch {}
}

export async function initChannelBadges(channelId: string): Promise<void> {
  if (channelBadges.has(channelId)) return;
  const map = new Map<string, string>();
  channelBadges.set(channelId, map);
  try {
    const res = await fetch(`/api/twitch/badges?channelId=${encodeURIComponent(channelId)}`);
    if (!res.ok) return;
    parseBadgeSets(await res.json(), map);
  } catch {}
}

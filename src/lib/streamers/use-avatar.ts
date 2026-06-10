"use client";

import { useEffect, useState } from "react";

import type { KickAvatarPayload } from "@/app/api/kick/avatar/route";
import { getHandle, primaryPlatform, type Streamer } from "./mock";

/** Resolved Kick avatar URLs (null = known missing); shared so each slug is fetched once per page. */
const kickCache = new Map<string, string | null>();
const kickPending = new Map<string, Promise<string | null>>();

function resolveKickAvatar(slug: string): Promise<string | null> {
  const key = slug.toLowerCase();
  if (kickCache.has(key)) return Promise.resolve(kickCache.get(key) ?? null);
  let pending = kickPending.get(key);
  if (!pending) {
    pending = fetch(`/api/kick/avatar?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? (r.json() as Promise<KickAvatarPayload>) : { url: null }))
      .then((d) => d.url ?? null)
      .catch(() => null)
      .then((url) => {
        kickCache.set(key, url);
        kickPending.delete(key);
        return url;
      });
    kickPending.set(key, pending);
  }
  return pending;
}

/**
 * Profile picture URL for a streamer. Twitch/X resolve directly via unavatar; Kick's CDN URLs
 * aren't derivable from the slug, so they resolve through our API as JSON — null until resolved
 * (the avatar shows initials meanwhile) and null when unavailable, instead of a 404 image load.
 */
export function useAvatarUrl(s: Streamer): string | null {
  const platform = primaryPlatform(s);
  const handle = getHandle(s, platform);
  const [kickUrl, setKickUrl] = useState<string | null>(() =>
    platform === "kick" ? (kickCache.get(handle.toLowerCase()) ?? null) : null,
  );

  useEffect(() => {
    if (platform !== "kick") return;
    let alive = true;
    resolveKickAvatar(handle).then((url) => {
      if (alive) setKickUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [platform, handle]);

  if (platform === "twitch") return `https://unavatar.io/twitch/${handle}?fallback=false`;
  if (platform === "x") return `https://unavatar.io/twitter/${handle}?fallback=false`;
  return kickUrl;
}

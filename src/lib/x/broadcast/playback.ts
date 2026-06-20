/**
 * Resolve an X broadcast (by handle, link, or id) to its HLS playback URL — the master .m3u8 the
 * web player uses. Anonymous/read-only, same guest-token flow as the chat reader:
 *   broadcasts/show           -> state + media_key
 *   live_video_stream/status  -> source.location (the master playlist)
 *
 * The CDN rejects browser Origins (403), so the browser can't fetch this directly — /api/x/hls
 * proxies it server-side. Server-only.
 */
import { broadcastIdFromLink, resolveBroadcast } from "./discovery";
import { guestHeaders, guestToken } from "./guest";

interface ShowInfo {
  state?: string;
  media_key?: string;
}
interface StatusResponse {
  source?: { location?: string; noRedirectPlaybackUrl?: string; status?: string; streamType?: string };
}

export interface Playback {
  id: string;
  /** Broadcast state from X, e.g. RUNNING / ENDED / TIMED_OUT. */
  state: string;
  /** Master HLS playlist URL, or null when the broadcast isn't currently playable. */
  playbackUrl: string | null;
}

const BROADCAST_ID = /^1[A-Za-z0-9]{12}$/;

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Accepts an @handle, a broadcast link, or a bare broadcast id; returns its playback info. */
export async function resolvePlayback(input: string): Promise<Playback | null> {
  const raw = input.trim();
  let id = broadcastIdFromLink(raw) ?? (BROADCAST_ID.test(raw) ? raw : null);
  if (!id) {
    const resolved = await resolveBroadcast(raw); // handle → currently-running broadcast id
    id = resolved?.id ?? null;
  }
  if (!id) return null;

  const headers = guestHeaders(await guestToken());
  const show = await getJson<{ broadcasts?: Record<string, ShowInfo | undefined> }>(
    `https://api.x.com/1.1/broadcasts/show.json?ids=${id}`,
    headers,
  );
  const b = show?.broadcasts?.[id];
  if (!b) return null;
  if (b.state && b.state !== "RUNNING") return { id, state: b.state, playbackUrl: null };
  if (!b.media_key) return { id, state: b.state ?? "UNKNOWN", playbackUrl: null };

  const status = await getJson<StatusResponse>(
    `https://api.x.com/1.1/live_video_stream/status/${b.media_key}?client=web`,
    headers,
  );
  const playbackUrl = status?.source?.location ?? status?.source?.noRedirectPlaybackUrl ?? null;
  return { id, state: b.state ?? "RUNNING", playbackUrl };
}

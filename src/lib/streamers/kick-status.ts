import type { KickStreamPayload } from "@/app/api/kick/stream/route";

/**
 * Kick live status via our API proxy. A browser-direct fetch to kick.com is pointless: the API
 * sends no Access-Control-Allow-Origin header, so the request is CORS-blocked every time and
 * spams the console with errors before falling back here anyway. The proxy route handles the
 * Cloudflare dance server-side and returns `live: null` when Kick can't be reached.
 */
export async function fetchKickStreamStatus(slug: string): Promise<KickStreamPayload | null> {
  try {
    const res = await fetch(`/api/kick/stream?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as KickStreamPayload;
    if (data.live === null) return null;
    return data;
  } catch {
    return null;
  }
}

import type { KickStreamPayload } from "@/app/api/kick/stream/route";

interface KickLivestreamJson {
  viewers?: number;
  session_title?: string;
  thumbnail?: { src?: string };
}

/**
 * Kick blocks many datacenter IPs (Coolify/Vercel), so server routes often return `live: null`.
 * The viewer's browser can usually reach Kick directly — try that first, then our API proxy.
 */
export async function fetchKickStreamStatus(slug: string): Promise<KickStreamPayload | null> {
  const direct = await fetchKickDirect(slug);
  if (direct) return direct;

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

async function fetchKickDirect(slug: string): Promise<KickStreamPayload | null> {
  try {
    const res = await fetch(
      `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/livestream`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { data: KickLivestreamJson | null };
    const ls = json.data;
    if (!ls) return { live: false, viewerCount: 0, title: "" };
    return {
      live: true,
      viewerCount: ls.viewers ?? 0,
      title: ls.session_title ?? "",
      thumbnail: ls.thumbnail?.src || undefined,
    };
  } catch {
    return null;
  }
}

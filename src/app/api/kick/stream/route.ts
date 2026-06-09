import { type NextRequest, NextResponse } from "next/server";

export interface KickStreamPayload {
  /** null = could not determine (Cloudflare blocked or parse failed). */
  live: boolean | null;
  viewerCount: number;
  title: string;
  thumbnail?: string;
}

const UNKNOWN: KickStreamPayload = { live: null, viewerCount: 0, title: "" };

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

interface KickLivestream {
  viewers?: number;
  session_title?: string;
  /** Live preview on images.kick.com; absent from the plain channel endpoint, present here. */
  thumbnail?: { src?: string };
}

/**
 * Primary path: the dedicated livestream JSON endpoint. Unlike the HTML page (Cloudflare-blocked)
 * and the plain channel endpoint (thumbnail often null), this reliably returns the live preview
 * thumbnail along with viewers and title. `data` is null when the channel is offline.
 */
async function fetchViaApi(slug: string): Promise<KickStreamPayload | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}/livestream`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data: KickLivestream | null };
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

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const viaApi = await fetchViaApi(slug);
  if (viaApi) {
    return NextResponse.json(viaApi, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=15" },
    });
  }

  // Fallback: scrape the HTML page (often Cloudflare-blocked server-side, but worth a try).
  try {
    const res = await fetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 30 },
    });

    if (!res.ok) return NextResponse.json(UNKNOWN);

    const html = await res.text();

    // Fast regex path — avoids parsing the full __NEXT_DATA__ JSON blob.
    // Kick embeds channel data as Next.js server props; "is_live" is always present.
    const liveMatch = html.match(/"is_live"\s*:\s*(true|false)/);
    if (!liveMatch) return NextResponse.json(UNKNOWN);

    const live = liveMatch[1] === "true";

    const viewersMatch = html.match(/"viewer_count"\s*:\s*(\d+)/);
    const viewerCount = viewersMatch ? parseInt(viewersMatch[1], 10) : 0;

    const titleMatch = html.match(/"session_title"\s*:\s*"([^"\\]*)"/);
    const title = titleMatch ? titleMatch[1] : "";

    // Thumbnail: try object with src, then bare string URL.
    const thumbObjMatch = html.match(/"thumbnail"\s*:\s*\{[^{}]*?"src"\s*:\s*"(https?:[^"]+)"/);
    const thumbStrMatch = html.match(/"thumbnail"\s*:\s*"(https?:[^"]+)"/);
    const thumbnail = (thumbObjMatch?.[1] ?? thumbStrMatch?.[1]) || undefined;

    return NextResponse.json({ live, viewerCount, title, thumbnail } satisfies KickStreamPayload, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=15" },
    });
  } catch {
    return NextResponse.json(UNKNOWN);
  }
}

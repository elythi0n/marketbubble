import { type NextRequest, NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface KickAvatarPayload {
  /** null = unavailable (channel missing, no picture, or Kick blocked the server). */
  url: string | null;
}

/**
 * Resolves a Kick channel's profile picture (unavatar has no Kick provider) from the v2 API's
 * user.profile_pic. Always responds 200 with JSON — `url: null` when unavailable — so the client
 * can fall back to initials without logging failed-resource errors in the console.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ url: null } satisfies KickAvatarPayload, { status: 400 });

  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (res.ok) {
      const data = (await res.json()) as { user?: { profile_pic?: string } };
      const pic = data.user?.profile_pic;
      if (pic) {
        return NextResponse.json({ url: pic } satisfies KickAvatarPayload, {
          headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
        });
      }
    }
  } catch {
    /* fall through */
  }

  // Short cache: Kick blocking the server (Cloudflare on datacenter IPs) is often transient.
  return NextResponse.json({ url: null } satisfies KickAvatarPayload, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}

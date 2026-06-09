import { type NextRequest, NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Redirects to a Kick channel's profile picture (unavatar has no Kick provider). Resolved from the
 * v2 API's user.profile_pic. 404 when unavailable, so the avatar <img> onError falls back to initials.
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return new NextResponse(null, { status: 400 });

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
        return NextResponse.redirect(pic, {
          status: 302,
          headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
        });
      }
    }
  } catch {
    /* fall through */
  }

  return new NextResponse(null, { status: 404 });
}

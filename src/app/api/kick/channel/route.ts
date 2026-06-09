import { type NextRequest, NextResponse } from "next/server";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Last-resort chatroom-id cache if both the API and the scrape fail (no user id here).
const KNOWN: Record<string, number> = {
  fazebanks: 668677,
  xqc: 668,
  eslcs: 101198156,
  odablock: 2393554,
  solomission: 2218947,
};

/** Primary: the v2 JSON API answers server-side and gives both the chatroom id and the user id. */
async function fetchViaApi(slug: string): Promise<{ chatroomId: number; userId?: number } | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { chatroom?: { id?: number }; user_id?: number };
    const chatroomId = data.chatroom?.id;
    if (!chatroomId) return null;
    return { chatroomId, userId: data.user_id };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  const viaApi = await fetchViaApi(slug);
  if (viaApi) {
    return NextResponse.json(
      { ...viaApi, slug, source: "api" },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=300" } },
    );
  }

  if (KNOWN[slug]) {
    return NextResponse.json(
      { chatroomId: KNOWN[slug], slug, source: "cache" },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  // Last resort: scrape the channel page (usually Cloudflare-blocked server-side).
  try {
    const res = await fetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return NextResponse.json({ error: `kick page returned ${res.status}` }, { status: 502 });

    const html = await res.text();

    // Pull chatroom id from the Next.js __NEXT_DATA__ embedded JSON.
    const match = html.match(/"chatroom"\s*:\s*\{[^}]*"id"\s*:\s*(\d+)/);
    const chatroomId = match ? parseInt(match[1], 10) : null;

    if (!chatroomId) return NextResponse.json({ error: "chatroom id not found" }, { status: 404 });

    return NextResponse.json(
      { chatroomId, slug, source: "scraped" },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=300" } },
    );
  } catch {
    return NextResponse.json({ error: "upstream error" }, { status: 502 });
  }
}

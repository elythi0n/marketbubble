import { type NextRequest, NextResponse } from "next/server";

const KNOWN: Record<string, number> = {
  fazebanks: 668677,
};

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "missing slug" }, { status: 400 });

  if (KNOWN[slug]) {
    return NextResponse.json(
      { chatroomId: KNOWN[slug], slug, source: "cache" },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  }

  // Scrape Kick channel page — avoids the JSON API which Cloudflare blocks server-side.
  try {
    const res = await fetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

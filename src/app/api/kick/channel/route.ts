import { type NextRequest, NextResponse } from "next/server";

import { kickApiJson } from "@/lib/server/kick-fetch";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Last-resort cache if both the API and the scrape fail. Ids verified against
// kick.com/api/v2/channels/{slug} — keep userId alongside so 7TV emotes still resolve.
const KNOWN: Record<string, { chatroomId: number; userId: number }> = {
  fazebanks: { chatroomId: 80748, userId: 81630 },
  ansem: { chatroomId: 108796898, userId: 110326750 },
  xqc: { chatroomId: 668, userId: 676 },
  eslcs: { chatroomId: 101198156, userId: 102711830 },
  odablock: { chatroomId: 2393554, userId: 2455830 },
  solomission: { chatroomId: 2218947, userId: 2280619 },
};

/** Primary: the v2 JSON API answers server-side and gives both the chatroom id and the user id. */
async function fetchViaApi(slug: string): Promise<{ chatroomId: number; userId?: number } | null> {
  const data = await kickApiJson<{ chatroom?: { id?: number }; user_id?: number }>(
    `v2/channels/${encodeURIComponent(slug)}`,
    3600,
  );
  const chatroomId = data?.chatroom?.id;
  if (!chatroomId) return null;
  return { chatroomId, userId: data.user_id };
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
      { ...KNOWN[slug], slug, source: "cache" },
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

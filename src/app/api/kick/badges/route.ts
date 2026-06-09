import { type NextRequest, NextResponse } from "next/server";

interface SubBadgeTier {
  months: number;
  imageUrl: string;
}

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Primary path: the JSON API exposes subscriber_badges (channel_subscriber_badges/<id>/original). */
async function fetchViaApi(slug: string): Promise<SubBadgeTier[] | null> {
  try {
    const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      subscriber_badges?: Array<{ months?: number; badge_image?: { src?: string } }>;
    };
    const out: SubBadgeTier[] = [];
    for (const b of data.subscriber_badges ?? []) {
      if (typeof b.months === "number" && b.badge_image?.src) {
        out.push({ months: b.months, imageUrl: b.badge_image.src });
      }
    }
    return out;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ subscriberBadges: [] }, { status: 400 });

  const viaApi = await fetchViaApi(slug);
  if (viaApi) {
    return NextResponse.json(
      { subscriberBadges: viaApi },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=300" } },
    );
  }

  // Fallback: scrape the HTML page (usually Cloudflare-blocked server-side, but try anyway).
  const subscriberBadges: SubBadgeTier[] = [];

  try {
    const res = await fetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const html = await res.text();
      const scriptMatch = html.match(
        /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
      );
      if (scriptMatch) {
        const data = JSON.parse(scriptMatch[1]);
        const ch =
          data?.props?.pageProps?.channel ??
          data?.props?.pageProps?.channelData?.channel ??
          {};
        const rawBadges: Array<{ months?: number; badge_image?: { src?: string } }> =
          ch.subscriber_badges ?? ch.subscriberBadges ?? [];
        for (const b of rawBadges) {
          if (typeof b.months === "number" && b.badge_image?.src) {
            subscriberBadges.push({ months: b.months, imageUrl: b.badge_image.src });
          }
        }
      }
    }
  } catch {}

  return NextResponse.json(
    { subscriberBadges },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=300" } },
  );
}

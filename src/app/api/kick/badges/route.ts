import { type NextRequest, NextResponse } from "next/server";

interface SubBadgeTier {
  months: number;
  imageUrl: string;
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ subscriberBadges: [] }, { status: 400 });

  const subscriberBadges: SubBadgeTier[] = [];

  try {
    const res = await fetch(`https://kick.com/${encodeURIComponent(slug)}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

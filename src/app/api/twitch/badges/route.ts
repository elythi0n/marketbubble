import { type NextRequest, NextResponse } from "next/server";

// Legacy format expected by the client-side parseBadgeSets function.
type BadgeSetsResponse = {
  badge_sets: Record<string, { versions: Record<string, { image_url_2x: string; title?: string }> }>;
};

type HelixBadgeData = {
  data: Array<{
    set_id: string;
    versions: Array<{ id: string; image_url_2x: string; title?: string }>;
  }>;
};

function helixToLegacy(helix: HelixBadgeData): BadgeSetsResponse {
  const badge_sets: BadgeSetsResponse["badge_sets"] = {};
  for (const set of helix.data) {
    const versions: Record<string, { image_url_2x: string; title?: string }> = {};
    for (const v of set.versions) {
      versions[v.id] = { image_url_2x: v.image_url_2x, title: v.title };
    }
    badge_sets[set.set_id] = { versions };
  }
  return { badge_sets };
}

async function fetchViaHelix(channelId?: string): Promise<BadgeSetsResponse | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  try {
    const tokenRes = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!tokenRes.ok) return null;
    const { access_token } = (await tokenRes.json()) as { access_token: string };

    const url = channelId
      ? `https://api.twitch.tv/helix/chat/badges?broadcaster_id=${encodeURIComponent(channelId)}`
      : `https://api.twitch.tv/helix/chat/badges/global`;

    const res = await fetch(url, {
      headers: {
        "Client-Id": clientId,
        Authorization: `Bearer ${access_token}`,
      },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return helixToLegacy((await res.json()) as HelixBadgeData);
  } catch {
    return null;
  }
}

async function fetchViaLegacy(channelId?: string): Promise<BadgeSetsResponse | null> {
  const url = channelId
    ? `https://badges.twitch.tv/v1/badges/channels/${channelId}/display`
    : `https://badges.twitch.tv/v1/badges/global/display`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as BadgeSetsResponse;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const channelId = req.nextUrl.searchParams.get("channelId") ?? undefined;

  const data =
    (await fetchViaHelix(channelId)) ??
    (await fetchViaLegacy(channelId)) ??
    { badge_sets: {} };

  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=600" },
  });
}

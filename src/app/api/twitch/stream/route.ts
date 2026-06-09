import { type NextRequest, NextResponse } from "next/server";

export interface StreamStatusPayload {
  /** null = fetch failed, fall back to local data. */
  live: boolean | null;
  viewerCount: number;
  title: string;
  thumbnail?: string;
}

const UNKNOWN: StreamStatusPayload = { live: null, viewerCount: 0, title: "" };

// ─── Public GQL (no credentials needed) ─────────────────────────────────────

const GQL_URL = "https://gql.twitch.tv/gql";
const GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

async function fetchViaGQL(login: string): Promise<StreamStatusPayload | null> {
  try {
    const body = [
      {
        operationName: "StreamMetadata",
        variables: { channelLogin: login },
        extensions: {
          persistedQuery: {
            version: 1,
            sha256Hash: "059c4653b788f5bdb2f5a2d2a24b0ddc3831a15079001a3d927556a96fb0517f",
          },
        },
      },
    ];

    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Client-ID": GQL_CLIENT_ID, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 30 },
    });

    if (!res.ok) return null;

    const data = await res.json() as [{ data?: { user?: { stream?: { viewersCount: number; title?: string; previewImageURL?: string } | null; lastBroadcast?: { title?: string } } } }];
    const user = data[0]?.data?.user;
    if (!user) return null;

    const stream = user.stream;
    return {
      live: stream !== null && stream !== undefined,
      viewerCount: stream?.viewersCount ?? 0,
      title: stream?.title ?? user.lastBroadcast?.title ?? "",
      thumbnail: stream?.previewImageURL ?? undefined,
    };
  } catch {
    return null;
  }
}

// ─── Helix (requires TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET) ────────────────

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 120_000) return cachedToken.value;
  try {
    const res = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
    });
    if (!res.ok) return null;
    const data = await res.json() as { access_token: string; expires_in: number };
    cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.value;
  } catch {
    return null;
  }
}

async function fetchViaHelix(login: string): Promise<StreamStatusPayload | null> {
  const appToken = await getAppToken();
  if (!appToken) return null;
  try {
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${encodeURIComponent(login)}`, {
      headers: { Authorization: `Bearer ${appToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID! },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const data = await res.json() as { data: { viewer_count: number; title: string; thumbnail_url?: string }[] };
    const stream = data.data?.[0];
    const rawThumb = stream?.thumbnail_url;
    return {
      live: !!stream,
      viewerCount: stream?.viewer_count ?? 0,
      title: stream?.title ?? "",
      thumbnail: rawThumb?.replace("{width}", "320").replace("{height}", "180"),
    };
  } catch {
    return null;
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const login = req.nextUrl.searchParams.get("login");
  if (!login) return NextResponse.json({ error: "missing login" }, { status: 400 });

  // Try GQL first (no credentials needed), then Helix as a higher-fidelity alternative.
  const result = (await fetchViaHelix(login)) ?? (await fetchViaGQL(login)) ?? UNKNOWN;

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=15" },
  });
}

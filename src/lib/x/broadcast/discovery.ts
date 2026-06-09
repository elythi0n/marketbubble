/**
 * Turn whatever you configured for an X source into a concrete broadcast id.
 *
 * Two layers, automatic first and a hard fallback underneath:
 *   1. A broadcast link or bare id  -> used directly (robust, never breaks).
 *   2. A bare @handle               -> resolved live via guest GraphQL:
 *        UserByScreenName  -> numeric user id
 *        UserTweets        -> scan the timeline for the currently-pinned/posted broadcast id
 *
 * The handle path depends on GraphQL query-ids that X rotates; they're overridable by env and
 * every failure degrades quietly to "nothing live", so a stale id never throws, it just yields null.
 */

import { guestHeaders, guestToken } from "./guest";

const GQL = "https://api.x.com/graphql";
const Q_USER_BY_NAME = process.env.X_GQL_USER_BY_SCREEN_NAME || "sLVLhk0bGj3MVFEKTdax1w";
const Q_USER_TWEETS = process.env.X_GQL_USER_TWEETS || "E3opETHurmVJflFsUBVuUQ";

// A minimal feature set; the timeline query rejects a null `features`, but is happy with this.
const TIMELINE_FEATURES = {
  responsive_web_graphql_timeline_navigation_enabled: true,
  rweb_tipjar_consumption_enabled: true,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
};

export interface ResolvedBroadcast {
  id: string;
  /** How we found it, for logging. */
  via: "link" | "handle";
  /** The configured handle (when known), used to label the source channel. */
  handle?: string;
}

/** Extract a broadcast id from an x.com / twitter.com link (any subdomain, with or without query). */
export function broadcastIdFromLink(input: string): string | null {
  const m = /broadcasts\/([A-Za-z0-9]+)/i.exec(input.trim());
  return m ? m[1] : null;
}

function encodeParams(params: Record<string, unknown>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(JSON.stringify(v))}`)
    .join("&");
}

async function userRestId(handle: string, token: string): Promise<string | null> {
  const url = `${GQL}/${Q_USER_BY_NAME}/UserByScreenName?${encodeParams({
    variables: { screen_name: handle },
  })}`;
  const res = await fetch(url, { headers: guestHeaders(token), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: { user?: { result?: { rest_id?: string } } } };
  return json.data?.user?.result?.rest_id ?? null;
}

/**
 * Scan a user's timeline for a broadcast id. Returns the most recent candidate (timelines are
 * reverse-chronological); the caller verifies it's actually RUNNING before connecting, so an
 * ended broadcast surfacing here costs nothing.
 */
async function broadcastFromTimeline(restId: string, token: string): Promise<string | null> {
  const url = `${GQL}/${Q_USER_TWEETS}/UserTweets?${encodeParams({
    variables: { userId: restId, count: 20, includePromotedContent: false, withVoice: false },
    features: TIMELINE_FEATURES,
  })}`;
  const res = await fetch(url, { headers: guestHeaders(token), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return null;
  const text = await res.text();

  for (const re of [
    /broadcasts\/([A-Za-z0-9]+)/g,
    /"broadcast_id"[^}]*?"string_value":"([A-Za-z0-9]+)"/g,
    /"broadcast_id":"([A-Za-z0-9]+)"/g,
  ]) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  return null;
}

/**
 * Resolve a configured source ("@handle", a broadcast link, or a bare id) to a broadcast id.
 * Returns null when there's nothing to connect to (no live broadcast, or discovery unavailable).
 */
export async function resolveBroadcast(input: string): Promise<ResolvedBroadcast | null> {
  const raw = input.trim();

  const linkId = broadcastIdFromLink(raw);
  if (linkId) return { id: linkId, via: "link" };

  // Treat the rest as a handle (bare ids should be passed as full broadcast links to stay unambiguous).
  const handle = raw.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;

  try {
    const token = await guestToken();
    const restId = await userRestId(handle, token);
    if (!restId) return null;
    const id = await broadcastFromTimeline(restId, token);
    return id ? { id, via: "handle", handle } : null;
  } catch {
    return null;
  }
}

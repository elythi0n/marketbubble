/**
 * Turn whatever you configured for an X source into a concrete broadcast id.
 *
 * Three layers, most durable first:
 *   1. A broadcast link or bare id  -> used directly (robust, never breaks).
 *   2. A bare @handle               -> syndication timeline (no auth, no rotating query-ids)
 *                                      scanned for every broadcast id it mentions.
 *   3. GraphQL fallback             -> UserByScreenName + UserTweets via guest token, only
 *                                      when syndication fails (query-ids rotate; env-overridable).
 * Candidates from 2/3 are then checked against broadcasts/show (one id per request — comma
 * batches 400 nowadays) and the currently-RUNNING one wins. Every failure degrades quietly to
 * "nothing live"; nothing here throws at the caller.
 */

import { guestHeaders, guestToken } from "./guest";
import { fetchSyndicationTimeline } from "./syndication";

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
 * Every broadcast id a timeline blob mentions. Pinned tweets render first, so the first match
 * is often an OLD broadcast — returning just that one would shadow the live one forever. The
 * caller checks all candidates against broadcasts/show and picks the RUNNING one.
 */
function extractBroadcastIds(text: string): string[] {
  const ids = new Set<string>();
  for (const re of [
    /broadcasts\\?\/([A-Za-z0-9]+)/g, // plain and JSON-escaped link forms
    /"broadcast_id"[^}]*?"string_value":"([A-Za-z0-9]+)"/g,
    /"broadcast_id":"([A-Za-z0-9]+)"/g,
  ]) {
    for (const m of text.matchAll(re)) ids.add(m[1]);
  }
  // Truncated t.co display_urls ("…/broadcasts/1vJpP…") leave partial ids behind; real ids are 13 chars.
  return [...ids].filter((id) => id.length >= 10);
}

/** GraphQL fallback timeline scan (guest token; query-ids rotate, hence fallback-only). */
async function broadcastsFromTimeline(restId: string, token: string): Promise<string[]> {
  const url = `${GQL}/${Q_USER_TWEETS}/UserTweets?${encodeParams({
    variables: { userId: restId, count: 40, includePromotedContent: false, withVoice: false },
    features: TIMELINE_FEATURES,
  })}`;
  const res = await fetch(url, { headers: guestHeaders(token), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) return [];
  return extractBroadcastIds(await res.text());
}

/** Of the candidate ids, the first that broadcasts/show reports as currently RUNNING (if any). */
async function firstRunning(ids: string[], token: string): Promise<string | null> {
  // show.json rejects comma-batched ids with a 400 nowadays — query individually, capped fan-out.
  const headers = guestHeaders(token);
  const running = await Promise.all(
    ids.slice(0, 8).map(async (id) => {
      try {
        const res = await fetch(`https://api.x.com/1.1/broadcasts/show.json?ids=${id}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          broadcasts?: Record<string, { state?: string } | undefined>;
        };
        return json.broadcasts?.[id]?.state === "RUNNING" ? id : null;
      } catch {
        return null;
      }
    }),
  );
  return running.find(Boolean) ?? null;
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
    // Syndication first: free, unauthenticated, and immune to GraphQL query-id rotation.
    let candidates = await fetchSyndicationTimeline(handle).then((t) =>
      t === null ? null : extractBroadcastIds(t),
    );
    if (candidates === null) {
      const token = await guestToken();
      const restId = await userRestId(handle, token);
      if (!restId) return null;
      candidates = await broadcastsFromTimeline(restId, token);
    }
    if (candidates.length === 0) return null;

    const id = await firstRunning(candidates, await guestToken());
    return id ? { id, via: "handle", handle } : null;
  } catch {
    return null;
  }
}

/**
 * Anonymous, read-only access to X's public APIs, exactly as a logged-out browser does it:
 * the shipped web bearer plus a short-lived guest token. No login, no user token, no account risk.
 *
 * Server-only. The bearer and User-Agent can be overridden by env if X ever rotates them.
 */

const WEB_BEARER =
  process.env.X_WEB_BEARER ||
  "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

export const X_USER_AGENT =
  process.env.X_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// Guest tokens live ~3h; refresh comfortably inside that so a request never races expiry.
const GUEST_TTL_MS = 2.5 * 60 * 60 * 1000;

let cached: { token: string; issuedAt: number } | null = null;
let inflight: Promise<string> | null = null;

async function activate(): Promise<string> {
  const res = await fetch("https://api.x.com/1.1/guest/activate.json", {
    method: "POST",
    headers: { Authorization: `Bearer ${WEB_BEARER}`, "User-Agent": X_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`guest token request failed (${res.status})`);
  const json = (await res.json()) as { guest_token?: string };
  if (!json.guest_token) throw new Error("guest token missing from response");
  cached = { token: json.guest_token, issuedAt: Date.now() };
  return json.guest_token;
}

/** A valid guest token, cached and de-duplicated across concurrent callers. */
export async function guestToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cached && Date.now() - cached.issuedAt < GUEST_TTL_MS) {
    return cached.token;
  }
  if (forceRefresh) cached = null;
  inflight ??= activate().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Headers for any guest-authenticated X request. */
export function guestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${WEB_BEARER}`,
    "x-guest-token": token,
    "User-Agent": X_USER_AGENT,
  };
}

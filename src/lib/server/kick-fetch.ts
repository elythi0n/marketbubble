/**
 * Server-side fetcher for kick.com's JSON API. Kick sits behind Cloudflare, which fingerprints
 * TLS: Node's undici fetch gets 403'd while the `curl` binary gets 200 from the same IP (the
 * exact pattern documented in src/lib/x/broadcast/syndication.ts for X's syndication host).
 *
 * Strategy: try undici fetch first — it's free, participates in Next's fetch cache, and may
 * pass in environments Cloudflare trusts — then fall back to curl. Curl responses are cached
 * in-memory with the same TTL since they bypass Next's cache.
 *
 * Server-only (child_process).
 */

import { execFile } from "node:child_process";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Fetch a URL through the `curl` binary (TLS fingerprint passes where undici's is blocked). */
function curlText(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    execFile(
      "curl",
      [
        "-s",
        "-L",
        "--compressed",
        "-m",
        "10",
        "-A",
        UA,
        "-H",
        "Accept: application/json",
        "-w",
        "\n%{http_code}",
        url,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          resolve({ ok: false, status: 0, body: "" });
          return;
        }
        const out = String(stdout);
        const nl = out.lastIndexOf("\n");
        const status = nl >= 0 ? Number(out.slice(nl + 1).trim()) || 0 : 0;
        resolve({ ok: status >= 200 && status < 300, status, body: nl >= 0 ? out.slice(0, nl) : out });
      },
    );
  });
}

const cache = new Map<string, { expires: number; value: unknown }>();

/**
 * JSON from `https://kick.com/api/<path>`, or null when both undici and curl fail (Cloudflare
 * block, network error, non-JSON body). `ttlSeconds` drives both Next's revalidate window and
 * the in-memory cache for the curl path.
 */
export async function kickApiJson<T>(path: string, ttlSeconds: number): Promise<T | null> {
  const url = `https://kick.com/api/${path}`;

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.value as T;

  let body: string | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: ttlSeconds },
    });
    if (res.ok) body = await res.text();
  } catch {
    /* fall through to curl */
  }

  if (body === null) {
    const res = await curlText(url);
    if (res.ok && res.body) body = res.body;
  }

  if (body === null) return null;

  try {
    const value = JSON.parse(body) as T;
    cache.set(url, { expires: Date.now() + ttlSeconds * 1000, value });
    return value;
  } catch {
    return null;
  }
}

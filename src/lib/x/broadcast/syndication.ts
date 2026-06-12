/**
 * X's syndication timeline — the no-auth endpoint that powers embedded timeline widgets on
 * third-party sites. No bearer, no guest token, no rotating GraphQL query-ids; built to be
 * polled by embeds, so it's the most durable free "what did this account post" source.
 *
 * Two quirks, both verified live:
 *   - The host fingerprints TLS: Node's undici fetch gets 429'd while the `curl` binary gets
 *     200 from the same IP, so we shell out to curl.
 *   - It rate-limits by IP under bursts. A shared gate paces consecutive fetches, and a real
 *     429 puts the whole host on cooldown (the GraphQL fallback covers the gap).
 *
 * Server-only (child_process).
 */

import { execFile } from "node:child_process";

import { X_USER_AGENT } from "./guest";

const MIN_GAP_MS = 1_200;
const COOLDOWN_MS = 5 * 60_000;

let lastFetchAt = 0;
let cooldownUntil = 0;
let gate: Promise<void> = Promise.resolve();

function pace(): Promise<void> {
  const mine = gate.then(async () => {
    const wait = lastFetchAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastFetchAt = Date.now();
  });
  gate = mine.catch(() => {});
  return mine;
}

/** Fetch a URL through the `curl` binary (TLS fingerprint passes where undici's is blocked). */
function curlText(url: string): Promise<{ ok: boolean; status: number; body: string }> {
  return new Promise((resolve) => {
    execFile(
      "curl",
      ["-s", "-L", "--compressed", "-m", "10", "-A", X_USER_AGENT, "-w", "\n%{http_code}", url],
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

const NEXT_DATA_RE = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

/**
 * The raw `__NEXT_DATA__` JSON text of a handle's syndication timeline (the caller scans it
 * for broadcast ids), or null on any failure so the caller can fall back to guest GraphQL.
 */
export async function fetchSyndicationTimeline(handle: string): Promise<string | null> {
  if (Date.now() < cooldownUntil) return null;
  await pace();
  const res = await curlText(
    `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(handle)}`,
  );
  if (res.status === 429) cooldownUntil = Date.now() + COOLDOWN_MS;
  if (!res.ok || !res.body) return null;
  const m = NEXT_DATA_RE.exec(res.body);
  return m ? m[1] : null;
}

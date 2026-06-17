/**
 * Tiny string helpers for X source identifiers. Pure functions only — no fs, no network — so this
 * module is safe to import from client components (the admin panel uses it to mirror the bridge's
 * normalization). Keep behavior identical across every caller; divergence here causes pins to mis-key.
 *
 * Source shapes accepted across the codebase:
 *   - `https://x.com/i/broadcasts/<id>` (with or without query/hash, x.com or twitter.com)
 *   - `@handle` or bare `handle`
 *   - a bare broadcast id (>= 6 alphanumeric)
 */

/** Dedup key for an X source. Lowercased so case-only differences merge to one entry. */
export function normalizeXSource(src: string): string {
  const s = src.trim();
  const link = /broadcasts\/([A-Za-z0-9]+)/i.exec(s);
  if (link) return link[1].toLowerCase();
  return s.replace(/^@/, "").toLowerCase();
}

/**
 * Extract a broadcast id from either a URL or a bare id. Returns "" when the input can't yield
 * a usable id — callers should reject on empty (don't fall back to silently storing garbage).
 */
export function parseBroadcastId(input: string): string {
  const s = input.trim();
  const link = /broadcasts\/([A-Za-z0-9]+)/i.exec(s);
  if (link) return link[1];
  if (/^[A-Za-z0-9]{6,}$/.test(s)) return s;
  return "";
}

import { NextResponse } from "next/server";

import type { XMention } from "@/lib/x/mentions";

// 6-hour ISR cache — scrape runs at most once per cache window.
export const revalidate = 21600;

// Nitter public instances tried in order until one responds.
const NITTER_INSTANCES = [
  "https://nitter.poast.org",
  "https://nitter.privacydev.net",
  "https://nitter.1d4.us",
  "https://nitter.kavin.rocks",
];

// Queries to search — OR-combined into a single request per instance.
// Override via env: X_MENTION_QUERIES='["@FaZeBanks","MarketBubble"]'
function getQueries(): string[] {
  try {
    const env = process.env.X_MENTION_QUERIES;
    if (env) return JSON.parse(env) as string[];
  } catch {}
  return ["@FaZeBanks", "MarketBubble"];
}

const UA = "Mozilla/5.0 (compatible; MarketBubble/1.0)";

// ─── RSS parser ───────────────────────────────────────────────────────────────

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<!\[CDATA\[([\s\S]+?)\]\]>/g, "$1")
    .trim();
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? unescapeXml(m[1]) : "";
}

/** Extract tweet ID from a nitter or x.com URL (last path segment that is numeric). */
function tweetIdFromUrl(url: string): string {
  const parts = url.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^\d{10,}$/.test(parts[i])) return parts[i];
  }
  return url; // fallback: use the URL itself as ID
}

/** Convert a nitter tweet URL to the canonical x.com URL. */
function toXUrl(nitterUrl: string): string {
  try {
    const u = new URL(nitterUrl);
    return `https://x.com${u.pathname}`;
  } catch {
    return nitterUrl;
  }
}

/**
 * Parse the author field which nitter encodes as one of:
 *   "@handle (Display Name)"  |  "@handle"  |  "Display Name"
 */
function parseAuthor(raw: string): { handle: string; name: string } {
  raw = raw.trim();
  const m = raw.match(/^@?(\w+)\s+\((.+)\)$/);
  if (m) return { handle: m[1], name: m[2] };
  if (raw.startsWith("@")) return { handle: raw.slice(1), name: raw.slice(1) };
  return { handle: raw.replace(/\s+/g, "_").toLowerCase(), name: raw };
}

function parseNitterRss(xml: string): XMention[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const mentions: XMention[] = [];

  for (const item of items) {
    const link = extractTag(item, "link") || extractTag(item, "guid");
    if (!link || !link.includes("/status/")) continue;

    const rawTitle = extractTag(item, "title");
    // Strip leading "@handle: " prefix that nitter sometimes adds to titles
    const text = rawTitle.replace(/^@\w+:\s*/, "").trim();
    if (!text) continue;

    const rawAuthor =
      extractTag(item, "dc:creator") || extractTag(item, "author") || "";
    const { handle, name } = parseAuthor(rawAuthor || (link.split("/")[3] ?? ""));

    const pubDate = extractTag(item, "pubDate") || extractTag(item, "dc:date");
    const publishedAt = pubDate
      ? new Date(pubDate).toISOString()
      : new Date().toISOString();

    const id = tweetIdFromUrl(link);
    mentions.push({ id, handle, name, text, publishedAt, tweetUrl: toXUrl(link) });
  }

  return mentions;
}

// ─── Fetch with instance fallback ─────────────────────────────────────────────

async function fetchNitter(query: string): Promise<XMention[]> {
  const encoded = encodeURIComponent(query);
  for (const instance of NITTER_INSTANCES) {
    try {
      const res = await fetch(`${instance}/search/rss?q=${encoded}&f=tweets`, {
        headers: { "User-Agent": UA, Accept: "application/rss+xml, text/xml" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const items = parseNitterRss(xml);
      if (items.length > 0) return items;
    } catch {
      // Try next instance.
    }
  }
  return [];
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET() {
  const queries = getQueries();
  const combined = queries.join(" OR ");

  const results = await fetchNitter(combined);

  if (results.length === 0) {
    return NextResponse.json([]);
  }

  // Deduplicate by tweet ID, sort newest first, cap at 40.
  const seen = new Set<string>();
  const deduped = results.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  deduped.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );

  return NextResponse.json(deduped.slice(0, 40));
}

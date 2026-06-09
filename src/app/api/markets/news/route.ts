import { createHash } from "crypto";

import { NextResponse } from "next/server";

import type { NewsArticle } from "@/lib/markets/news";

export const revalidate = 300; // 5-minute cache

// ─── RSS sources ─────────────────────────────────────────────────────────────

const SOURCES: { url: string; name: string; category: NewsArticle["category"] }[] = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk", category: "crypto" },
  { url: "https://cointelegraph.com/rss", name: "CoinTelegraph", category: "crypto" },
  { url: "https://decrypt.co/feed", name: "Decrypt", category: "crypto" },
  { url: "https://finance.yahoo.com/rss/topstories", name: "Yahoo Finance", category: "markets" },
];

const UA = "Mozilla/5.0 (compatible; MarketBubble/1.0; +https://marketbubble.com)";

// ─── RSS parser ───────────────────────────────────────────────────────────────

function unescape(s: string): string {
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
  return m ? unescape(m[1]) : "";
}

function extractAttr(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]+${attr}="([^"]+)"`, "i"));
  return m ? m[1] : "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRss(
  xml: string,
  source: string,
  category: NewsArticle["category"],
): NewsArticle[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const articles: NewsArticle[] = [];

  for (const item of items) {
    const title = stripHtml(extractTag(item, "title"));
    if (!title) continue;

    // <link> can be bare text or inside CDATA
    const link = extractTag(item, "link") || extractAttr(item, "feedburner:origLink", "href");
    if (!link || !link.startsWith("http")) continue;

    const rawDesc = extractTag(item, "description") || extractTag(item, "content:encoded");
    const description = stripHtml(rawDesc).slice(0, 500) || undefined;

    const pubDate = extractTag(item, "pubDate") || extractTag(item, "dc:date");
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();

    // Author — dc:creator is most reliable; fall back to <author>
    const rawAuthor = extractTag(item, "dc:creator") || extractTag(item, "author");
    const author = rawAuthor ? stripHtml(rawAuthor).slice(0, 80) : undefined;

    // Tags — collect all <category> values, deduplicate, cap at 5
    const tagMatches = [...item.matchAll(/<category[^>]*>([^<]+)<\/category>/gi)];
    const tags = tagMatches.length
      ? [...new Set(tagMatches.map((m) => unescape(m[1]).trim()).filter(Boolean))].slice(0, 5)
      : undefined;

    // Thumbnail — prefer media:content, then media:thumbnail, then enclosure
    const thumbnail =
      extractAttr(item, "media:content", "url") ||
      extractAttr(item, "media:thumbnail", "url") ||
      extractAttr(item, "enclosure", "url") ||
      undefined;

    const id = createHash("sha256").update(link).digest("hex").slice(0, 16);

    articles.push({ id, title, description, url: link, source, publishedAt, category, thumbnail, author, tags });
  }

  return articles;
}

// ─── Fetch one source ─────────────────────────────────────────────────────────

async function fetchSource(
  src: (typeof SOURCES)[number],
): Promise<NewsArticle[]> {
  const res = await fetch(src.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml" },
    next: { revalidate: 300 },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  return parseRss(xml, src.name, src.category);
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET() {
  const results = await Promise.allSettled(SOURCES.map(fetchSource));

  const articles = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, 40);

  return NextResponse.json(articles);
}

import { NextResponse } from "next/server";

import { MOCK_PREDICTIONS, type PredictionRow } from "@/lib/markets/predictions";

export const revalidate = 60;

const POLYMARKET_URL =
  "https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=30&order=volume&ascending=false";
const UA = "Mozilla/5.0 (compatible; MarketBubble/1.0)";

function formatVolume(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export async function GET() {
  try {
    const res = await fetch(POLYMARKET_URL, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return NextResponse.json(MOCK_PREDICTIONS);

    const markets: unknown[] = await res.json();

    const rows: PredictionRow[] = [];
    for (const m of markets) {
      if (!m || typeof m !== "object") continue;
      const market = m as Record<string, unknown>;
      try {
        const prices: string[] = JSON.parse(market.outcomePrices as string);
        if (prices.length !== 2) continue;
        const question = (market.question as string)?.trim();
        if (!question) continue;
        const yes = Math.round(parseFloat(prices[0]) * 100);
        // Polymarket's canonical share URL is `/event/<slug>` where the slug comes from the
        // market's parent event (e.g. one "World Cup goals" event holds many per-player markets).
        // It lives under `events[0].slug` in the gamma-api response. The market's own `slug`
        // is *not* a valid event URL in those cases and 404s on polymarket.com — only fall
        // back to it when there's no parent event at all (rare, mostly legacy markets).
        let slug: string | null = null;
        const events = Array.isArray(market.events) ? (market.events as Array<Record<string, unknown>>) : [];
        if (events[0] && typeof events[0].slug === "string") slug = events[0].slug;
        else if (typeof market.slug === "string") slug = market.slug;
        rows.push({
          id: String(market.id ?? market.conditionId ?? rows.length),
          question,
          yesPercent: yes,
          noPercent: 100 - yes,
          volume: formatVolume((market.volumeNum as number) ?? 0),
          url: slug ? `https://polymarket.com/event/${encodeURIComponent(slug)}` : undefined,
        });
      } catch {
        continue;
      }
      if (rows.length >= 12) break;
    }

    return NextResponse.json(rows.length > 0 ? rows : MOCK_PREDICTIONS);
  } catch {
    return NextResponse.json(MOCK_PREDICTIONS);
  }
}

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
        rows.push({
          id: String(market.id ?? market.conditionId ?? rows.length),
          question,
          yesPercent: yes,
          noPercent: 100 - yes,
          volume: formatVolume((market.volumeNum as number) ?? 0),
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

import { NextResponse } from "next/server";

export const revalidate = 60;

interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

/** Top crypto gainers/losers over 24h, from CoinGecko (no key). Server-side to avoid CORS + cache. */
export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h",
      { next: { revalidate: 60 }, headers: { accept: "application/json" } },
    );
    if (!res.ok) return NextResponse.json({ gainers: [], losers: [] });
    const coins = (await res.json()) as Array<{
      symbol: string;
      name: string;
      current_price: number;
      price_change_percentage_24h: number | null;
    }>;
    const mapped: Mover[] = coins
      .map((c) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        price: c.current_price,
        changePct: c.price_change_percentage_24h ?? 0,
      }))
      .filter((m) => Number.isFinite(m.changePct));
    const sorted = [...mapped].sort((a, b) => b.changePct - a.changePct);
    return NextResponse.json({
      gainers: sorted.slice(0, 8),
      losers: sorted.slice(-8).reverse(),
    });
  } catch {
    return NextResponse.json({ gainers: [], losers: [] });
  }
}

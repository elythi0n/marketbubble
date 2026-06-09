import { NextResponse } from "next/server";

export const revalidate = 120;

interface HyperTrader {
  address: string;
  winRate?: number;
  totalVolume?: string;
  grade?: string;
  mainToken?: string;
  lastOpenEventSide?: string | null;
  longPositions?: number;
  shortPositions?: number;
  pnl30d?: { amount?: string; percentage?: number };
}

export interface LeaderTrader {
  address: string;
  pnl30d: number;
  pnl30dUsd: number;
  winRate: number;
  volume: number;
  bias: "long" | "short" | null;
  mainToken: string;
  grade: string;
}

/** Real on-chain Hyperliquid traders via HyperStats (no key). Server-side for CORS + caching. */
export async function GET() {
  try {
    const res = await fetch(
      "https://v2-api.hyperstats.org/api/traders/top?limit=10&offset=0&sortBy=pnl_30d&order=desc",
      { next: { revalidate: 120 }, headers: { "User-Agent": "Mozilla/5.0", accept: "application/json" } },
    );
    if (!res.ok) return NextResponse.json({ source: "Hyperliquid", traders: [] });
    const json = (await res.json()) as { traders?: HyperTrader[] };
    const traders: LeaderTrader[] = (json.traders ?? []).map((t) => ({
      address: t.address,
      pnl30d: t.pnl30d?.percentage ?? 0,
      pnl30dUsd: Number(t.pnl30d?.amount ?? 0),
      winRate: Math.round((t.winRate ?? 0) * 100),
      volume: Number(t.totalVolume ?? 0),
      bias:
        t.lastOpenEventSide === "long" || t.lastOpenEventSide === "short"
          ? t.lastOpenEventSide
          : (t.shortPositions ?? 0) > (t.longPositions ?? 0)
            ? "short"
            : "long",
      mainToken: t.mainToken ?? "",
      grade: t.grade ?? "",
    }));
    return NextResponse.json({ source: "Hyperliquid", traders });
  } catch {
    return NextResponse.json({ source: "Hyperliquid", traders: [] });
  }
}

import { NextResponse } from "next/server";

export const revalidate = 10;

const HL_INFO = "https://api.hyperliquid.xyz/info";
const COINS = ["BTC", "ETH", "SOL", "HYPE", "ARB", "DOGE"];

interface HLTrade {
  coin: string;
  side: "B" | "A";
  px: string;
  sz: string;
  time: number;
  hash: string;
  tid: number;
}

export interface TradeRow {
  id: string;
  shortHash: string;
  asset: string;
  side: "long" | "short";
  price: string;
  size: string;
  notional: number;
  time: number;
}

async function fetchCoinTrades(coin: string): Promise<HLTrade[]> {
  try {
    const res = await fetch(HL_INFO, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "recentTrades", coin }),
      next: { revalidate: 10 },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

function formatPrice(n: number): string {
  if (n >= 10_000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toPrecision(4)}`;
}

function formatNotional(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function shortHash(hash: string): string {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export async function GET() {
  const results = await Promise.allSettled(COINS.map(fetchCoinTrades));

  const trades: TradeRow[] = results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .map((t): TradeRow => {
      const px = parseFloat(t.px);
      const sz = parseFloat(t.sz);
      const notional = px * sz;
      return {
        id: `${t.hash}-${t.tid}`,
        shortHash: shortHash(t.hash),
        asset: t.coin,
        side: t.side === "B" ? "long" : "short",
        price: formatPrice(px),
        size: formatNotional(notional),
        notional,
        time: t.time,
      };
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, 30);

  return NextResponse.json(trades);
}

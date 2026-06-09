import { NextResponse } from "next/server";

import type { Ticker } from "@/lib/markets/types";

export const revalidate = 30;

// CoinGecko coin IDs
const GECKO: Record<string, { symbol: string; name: string }> = {
  bitcoin: { symbol: "BTC", name: "Bitcoin" },
  ethereum: { symbol: "ETH", name: "Ethereum" },
  solana: { symbol: "SOL", name: "Solana" },
  hyperliquid: { symbol: "HYPE", name: "Hyperliquid" },
  dogecoin: { symbol: "DOGE", name: "Dogecoin" },
};

// Yahoo Finance ticker → display meta
const YAHOO: Record<string, { symbol: string; name: string; assetClass: "equity" | "index" }> = {
  NVDA: { symbol: "NVDA", name: "NVIDIA", assetClass: "equity" },
  TSLA: { symbol: "TSLA", name: "Tesla", assetClass: "equity" },
  AAPL: { symbol: "AAPL", name: "Apple", assetClass: "equity" },
  "^GSPC": { symbol: "SPX", name: "S&P 500", assetClass: "index" },
  "^NDX": { symbol: "NDX", name: "Nasdaq 100", assetClass: "index" },
};

const DISPLAY_ORDER = ["BTC", "ETH", "SOL", "HYPE", "DOGE", "SPX", "NDX", "NVDA", "TSLA", "AAPL"];

async function fetchCrypto(): Promise<Ticker[]> {
  const ids = Object.keys(GECKO).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { next: { revalidate: 30 }, headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data = (await res.json()) as Record<string, { usd: number; usd_24h_change: number }>;
  return Object.entries(data).flatMap(([id, val]) => {
    const meta = GECKO[id];
    if (!meta || !Number.isFinite(val.usd)) return [];
    return [{ symbol: meta.symbol, name: meta.name, price: val.usd, changePct: val.usd_24h_change ?? 0, assetClass: "crypto" as const }];
  });
}

async function fetchStocks(): Promise<Ticker[]> {
  const results = await Promise.allSettled(
    Object.entries(YAHOO).map(async ([yahooSym, meta]) => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSym)}?interval=1d&range=1d`,
        { next: { revalidate: 30 }, headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
      );
      if (!res.ok) throw new Error(`Yahoo ${yahooSym} ${res.status}`);
      const json = (await res.json()) as { chart: { result: Array<{ meta: { regularMarketPrice: number; chartPreviousClose: number } }> | null } };
      const r = json.chart?.result?.[0];
      if (!r) throw new Error(`Yahoo ${yahooSym} no result`);
      const price = r.meta.regularMarketPrice;
      const prev = r.meta.chartPreviousClose;
      if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) throw new Error(`Yahoo ${yahooSym} bad data`);
      return { symbol: meta.symbol, name: meta.name, price, changePct: ((price - prev) / prev) * 100, assetClass: meta.assetClass };
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

export async function GET() {
  const [cryptoResult, stocksResult] = await Promise.allSettled([fetchCrypto(), fetchStocks()]);

  const crypto = cryptoResult.status === "fulfilled" ? cryptoResult.value : [];
  const stocks = stocksResult.status === "fulfilled" ? stocksResult.value : [];
  const all = [...crypto, ...stocks].sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.symbol) - DISPLAY_ORDER.indexOf(b.symbol),
  );

  if (all.length === 0) return NextResponse.json({ error: "all sources failed" }, { status: 503 });
  return NextResponse.json(all);
}

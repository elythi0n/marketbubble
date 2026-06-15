import { type NextRequest, NextResponse } from "next/server";

/**
 * Per-symbol live quote. Backs the watchlist for anything that isn't a Binance pair —
 * stocks, indexes, and base crypto symbols like BTC / ETH that map to Yahoo's `<SYM>-USD`.
 *
 * Behavior:
 *  - Tries Yahoo Finance with the literal symbol first.
 *  - If a plain alphabetic 2–5 character base 404s (e.g. BTC, ETH, SOL), retries with
 *    `-USD` appended — Yahoo's crypto-quote convention.
 *  - 30-second server cache via `revalidate` so 100 visitors watching the same ticker
 *    don't fan out to 100 Yahoo requests.
 */

// Force dynamic rendering per request — the symbol comes from the URL and the per-route
// `revalidate` cache was returning stale entries (an early miss got pinned for 30s). Per-fetch
// caching below still dedupes hits to Yahoo, so one symbol still incurs at most one
// upstream request per revalidate window across all visitors.
export const dynamic = "force-dynamic";

const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
const ALLOWED = /^[A-Z0-9.\-^]{1,16}$/;

/**
 * Well-known crypto bases: when the user types one of these we resolve to the `-USD` Yahoo
 * pair rather than the literal symbol. Several of these (BTC, ETH, …) are *also* registered
 * as Yahoo equity tickers (ETFs etc.) so the bare lookup would otherwise return the wrong
 * asset. List is intentionally small — anyone wanting a less-known token can type the full
 * Yahoo ticker (e.g. "MOG-USD") or a Binance pair (e.g. "MOGUSDT").
 */
const CRYPTO_BASES = new Set([
  "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK", "ADA", "DOT",
  "MATIC", "ATOM", "NEAR", "OP", "ARB", "SUI", "APT", "INJ", "SEI", "TIA",
  "TRX", "LTC", "BCH", "ETC", "FIL", "HBAR", "AAVE", "MKR", "RNDR", "GRT",
  "IMX", "FTM", "SAND", "MANA", "PEPE", "SHIB", "WIF", "BONK", "HYPE", "TON",
]);

interface YahooMeta {
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  previousClose?: number;
  symbol?: string;
  shortName?: string;
}

async function fetchYahoo(symbol: string): Promise<YahooMeta | null> {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        // Per-URL fetch cache (30s) — many visitors watching the same symbol share one upstream
        // request, but each (symbol, url) pair gets its own entry so BTC-USD ≠ BTC.
        next: { revalidate: 30 },
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { chart?: { result?: Array<{ meta?: YahooMeta }> | null } };
    return json?.chart?.result?.[0]?.meta ?? null;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: raw } = await params;
  const symbol = decodeURIComponent(raw || "").toUpperCase();
  if (!ALLOWED.test(symbol)) return NextResponse.json({ error: "invalid symbol" }, { status: 400 });

  // Crypto bases first: BTC, ETH, etc. are *also* valid equity tickers (ETFs) on Yahoo, so
  // the bare lookup returns the wrong asset. Hit the `-USD` pair first for known bases;
  // fall back to the bare symbol if the pair lookup misses (handles weird quote conventions).
  let meta: YahooMeta | null = null;
  if (CRYPTO_BASES.has(symbol)) {
    meta = await fetchYahoo(`${symbol}-USD`);
  }
  if (!meta) meta = await fetchYahoo(symbol);

  // Last resort for short alphabetic symbols that aren't in our known-base set: try `-USD`.
  // Catches new tokens before we add them to the list.
  if (!meta && /^[A-Z]{2,5}$/.test(symbol) && !CRYPTO_BASES.has(symbol)) {
    meta = await fetchYahoo(`${symbol}-USD`);
  }

  if (!meta || !Number.isFinite(meta.regularMarketPrice)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const price = meta.regularMarketPrice as number;
  const prev = (meta.chartPreviousClose ?? meta.previousClose ?? price) as number;
  const changePct = prev > 0 ? ((price - prev) / prev) * 100 : 0;

  return NextResponse.json({
    symbol,
    resolved: meta.symbol ?? symbol,
    name: meta.shortName ?? null,
    price,
    changePct,
  });
}

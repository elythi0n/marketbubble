import type { Ticker } from "./types";

/** Placeholder market snapshot for the marquee and stats. Replaced by live feeds in a later phase. */
export const MOCK_TICKERS: Ticker[] = [
  { symbol: "BTC", name: "Bitcoin", price: 71248.32, changePct: 2.41, assetClass: "crypto" },
  { symbol: "ETH", name: "Ethereum", price: 3842.11, changePct: -1.18, assetClass: "crypto" },
  { symbol: "SOL", name: "Solana", price: 186.74, changePct: 5.62, assetClass: "crypto" },
  { symbol: "HYPE", name: "Hyperliquid", price: 28.9, changePct: 8.13, assetClass: "crypto" },
  { symbol: "DOGE", name: "Dogecoin", price: 0.1624, changePct: -3.07, assetClass: "crypto" },
  { symbol: "SPX", name: "S&P 500", price: 5478.2, changePct: 0.34, assetClass: "index" },
  { symbol: "NDX", name: "Nasdaq 100", price: 19632.5, changePct: 0.81, assetClass: "index" },
  { symbol: "NVDA", name: "NVIDIA", price: 124.3, changePct: 3.92, assetClass: "equity" },
  { symbol: "TSLA", name: "Tesla", price: 246.18, changePct: -2.44, assetClass: "equity" },
  { symbol: "AAPL", name: "Apple", price: 213.07, changePct: 0.62, assetClass: "equity" },
  { symbol: "GOLD", name: "Gold", price: 2338.4, changePct: -0.27, assetClass: "commodity" },
  { symbol: "WTI", name: "Crude Oil", price: 80.55, changePct: 1.46, assetClass: "commodity" },
];

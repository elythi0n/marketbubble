import { MOCK_TICKERS } from "./mock";
import type { Ticker } from "./types";

const BY_SYMBOL = new Map(MOCK_TICKERS.map((t) => [t.symbol.toUpperCase(), t]));

/** Find a ticker by symbol (case-insensitive). Used by cashtag hover cards. */
export function getTicker(symbol: string): Ticker | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}

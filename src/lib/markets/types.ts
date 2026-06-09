export type AssetClass = "crypto" | "equity" | "index" | "commodity";

export interface Ticker {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  assetClass: AssetClass;
}

export function formatPrice(price: number): string {
  if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (price >= 1) return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function formatChange(changePct: number): string {
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct.toFixed(2)}%`;
}

"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface StockDrawerContextValue {
  symbol: string | null;
  openStock: (symbol: string) => void;
  closeStock: () => void;
}

const StockDrawerContext = createContext<StockDrawerContextValue | null>(null);

export function StockDrawerProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const openStock = useCallback((s: string) => setSymbol(s.toUpperCase()), []);
  const closeStock = useCallback(() => setSymbol(null), []);
  return (
    <StockDrawerContext.Provider value={{ symbol, openStock, closeStock }}>
      {children}
    </StockDrawerContext.Provider>
  );
}

export function useStockDrawer(): StockDrawerContextValue {
  const value = useContext(StockDrawerContext);
  if (!value) throw new Error("useStockDrawer must be used within StockDrawerProvider");
  return value;
}

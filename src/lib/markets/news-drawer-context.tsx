"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import type { NewsArticle } from "./news";

interface NewsDrawerContextValue {
  article: NewsArticle | null;
  openArticle: (a: NewsArticle) => void;
  closeArticle: () => void;
}

const NewsDrawerContext = createContext<NewsDrawerContextValue | null>(null);

export function NewsDrawerProvider({ children }: { children: ReactNode }) {
  const [article, setArticle] = useState<NewsArticle | null>(null);
  return (
    <NewsDrawerContext.Provider
      value={{ article, openArticle: setArticle, closeArticle: () => setArticle(null) }}
    >
      {children}
    </NewsDrawerContext.Provider>
  );
}

export function useNewsDrawer(): NewsDrawerContextValue {
  const ctx = useContext(NewsDrawerContext);
  if (!ctx) throw new Error("useNewsDrawer must be used within NewsDrawerProvider");
  return ctx;
}

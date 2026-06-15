"use client";

import { useEffect, useState } from "react";

import { useNewsDrawer } from "@/lib/markets/news-drawer-context";
import { MOCK_NEWS, type NewsArticle } from "@/lib/markets/news";

const POLL_MS = 5 * 60_000;

const CATEGORY_PILL: Record<string, string> = {
  crypto: "bg-feed-warn/10 text-feed-warn",
  markets: "bg-feed-ok/10 text-feed-ok",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function ArticleRow({ article, onClick }: { article: NewsArticle; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full flex-col gap-1.5 border-b border-hairline px-3 py-3 text-left transition-colors hover:bg-overlay-weak"
    >
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[0.55rem] font-bold uppercase tracking-[0.12em] ${CATEGORY_PILL[article.category] ?? "bg-overlay-weak text-muted-foreground"}`}>
          {article.category}
        </span>
        <span className="text-[0.65rem] font-medium text-muted-foreground">{article.source}</span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground/50">{timeAgo(article.publishedAt)}</span>
      </div>

      <p className="line-clamp-2 text-[0.82rem] font-medium leading-snug text-foreground/90 transition-colors group-hover:text-foreground">
        {article.title}
      </p>

      {article.description && (
        <p className="line-clamp-1 text-[0.72rem] text-muted-foreground/60">
          {article.description}
        </p>
      )}
    </button>
  );
}

export function NewsPane() {
  const [articles, setArticles] = useState<NewsArticle[]>(MOCK_NEWS);
  const { openArticle } = useNewsDrawer();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/markets/news");
        if (!res.ok) return;
        const data = (await res.json()) as NewsArticle[];
        const seen = new Set<string>();
        const deduped = data.filter((a) => {
          if (seen.has(a.id)) return false;
          seen.add(a.id);
          return true;
        });
        if (deduped.length > 0) setArticles(deduped);
      } catch {}
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Market News
        </span>
      </header>

      <div className="flex-1 overflow-y-auto mb-scroll">
        {articles.map((a) => (
          <ArticleRow key={a.id} article={a} onClick={() => openArticle(a)} />
        ))}
        {articles.length === 0 && (
          <p className="px-4 py-8 text-center text-[0.72rem] text-muted-foreground/40">
            No articles yet
          </p>
        )}
      </div>
    </div>
  );
}

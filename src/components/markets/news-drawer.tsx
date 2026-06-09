"use client";

import { ExternalLink, X } from "lucide-react";

import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useNewsDrawer } from "@/lib/markets/news-drawer-context";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_COLOR: Record<string, string> = {
  crypto: "text-[#d8b25a]",
  markets: "text-[#46c45a]",
};

const CATEGORY_PILL: Record<string, string> = {
  crypto: "bg-[#d8b25a]/10 text-[#d8b25a]",
  markets: "bg-[#46c45a]/10 text-[#46c45a]",
};

export function NewsDrawer() {
  const { article, closeArticle } = useNewsDrawer();

  return (
    <Drawer direction="right" open={!!article} onOpenChange={(open) => { if (!open) closeArticle(); }}>
      <DrawerContent>
        <DrawerTitle className="sr-only">{article?.title ?? "News"}</DrawerTitle>

        {article && (
          <div className="flex h-full flex-col overflow-hidden">
            {/* Header */}
            <div className="flex flex-none items-center justify-between border-b border-white/[0.07] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className={`text-[0.6rem] font-bold uppercase tracking-[0.16em] ${CATEGORY_COLOR[article.category] ?? "text-muted-foreground"}`}>
                  {article.category}
                </span>
                <span className="text-[0.6rem] text-muted-foreground/50">·</span>
                <span className="text-[0.68rem] font-medium text-muted-foreground">{article.source}</span>
                <span className="text-[0.6rem] text-muted-foreground/50">·</span>
                <span className="text-[0.68rem] text-muted-foreground/60" title={formatDate(article.publishedAt)}>
                  {timeAgo(article.publishedAt)}
                </span>
              </div>
              <button
                type="button"
                onClick={closeArticle}
                aria-label="Close"
                className="flex size-7 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-5">

              {/* Thumbnail */}
              {article.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={article.thumbnail}
                  alt=""
                  className="mb-5 w-full rounded-xl object-cover"
                  style={{ aspectRatio: "16/9" }}
                />
              )}

              {/* Category pill + author */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-[0.12em] ${CATEGORY_PILL[article.category] ?? "bg-white/[0.05] text-muted-foreground"}`}>
                  {article.category}
                </span>
                {article.author && (
                  <span className="text-[0.72rem] text-muted-foreground">
                    by <span className="font-medium text-foreground/80">{article.author}</span>
                  </span>
                )}
              </div>

              {/* Title */}
              <h2 className="text-[1.05rem] font-bold leading-snug text-foreground">
                {article.title}
              </h2>

              {/* Description */}
              {article.description && (
                <p className="mt-3 text-[0.84rem] leading-relaxed text-muted-foreground">
                  {article.description}
                </p>
              )}

              {/* Tags */}
              {article.tags && article.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {article.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[0.65rem] text-muted-foreground/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Divider */}
              <div className="mt-6 border-t border-white/[0.06]" />

              {/* Meta footer */}
              <div className="mt-3 flex items-center gap-1.5 text-[0.68rem] text-muted-foreground/50">
                <span>{article.source}</span>
                <span>·</span>
                <span>{formatDate(article.publishedAt)}</span>
              </div>

              {/* Read full article */}
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-4 py-3 text-[0.84rem] font-semibold text-foreground transition-colors hover:bg-white/[0.1]"
              >
                <ExternalLink className="size-4" />
                Read full article on {article.source}
              </a>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

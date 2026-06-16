"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Play, RefreshCw, X } from "lucide-react";

import type { NewsArticle } from "@/lib/markets/news";
import type { Clip } from "@/lib/streamers/clips";
import { MOCK_CLIPS } from "@/lib/streamers/clips";
import type { Ticker } from "@/lib/markets/types";
import { formatPrice, formatChange } from "@/lib/markets/types";
import { ClipsDialog, ClipSourceIcon } from "@/components/dashboard/clips-dialog";
import { walburn } from "@/lib/fonts";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────

const BREAKING_MS = 30 * 60 * 1000;
const CASHTAG_RE = /(\$[A-Z]{1,6})/g;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function isBreaking(publishedAt: string): boolean {
  return Date.now() - new Date(publishedAt).getTime() < BREAKING_MS;
}

function formatMastDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function fngColor(value: number): string {
  if (value >= 75) return "var(--feed-ok)";
  if (value >= 56) return "var(--feed-ok)";
  if (value >= 45) return "var(--foreground)";
  if (value >= 25) return "var(--feed-warn)";
  return "var(--feed-danger)";
}

// ─── headline with cashtag highlights ─────────────────────────────────────────

function HeadlineText({ text }: { text: string }) {
  const parts = text.split(CASHTAG_RE);
  return (
    <>
      {parts.map((part, i) =>
        /^\$[A-Z]{1,6}$/.test(part)
          ? <span key={i} className="text-accent-violet">{part}</span>
          : part
      )}
    </>
  );
}

// ─── fear & greed badge ───────────────────────────────────────────────────────

interface FearGreed { value: number; classification: string }

function FearGreedBadge({ value, classification }: FearGreed) {
  const color = fngColor(value);
  return (
    <span className="inline-flex items-center gap-2">
      {/* arc gauge — simple SVG semicircle */}
      <svg width="28" height="16" viewBox="0 0 28 16" fill="none" aria-hidden>
        <path
          d="M2 14 A12 12 0 0 1 26 14"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="text-foreground/[0.1]"
        />
        <path
          d="M2 14 A12 12 0 0 1 26 14"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * 37.7} 37.7`}
          opacity="0.85"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-muted-foreground/45">F&G</span>
        <span className="font-mono text-[0.72rem] font-bold tabular-nums" style={{ color }}>
          {value} <span className="text-[0.6rem] font-normal opacity-70">{classification}</span>
        </span>
      </span>
    </span>
  );
}

// ─── article meta row (breaking + category) ───────────────────────────────────

const CAT_LABEL: Record<string, string> = { crypto: "Crypto", markets: "Markets" };
const CAT_DOT: Record<string, string> = { crypto: "bg-accent-violet", markets: "bg-feed-ok" };
const CAT_TEXT: Record<string, string> = { crypto: "text-accent-violet", markets: "text-feed-ok" };

function ArticleMeta({ category, publishedAt }: { category: string; publishedAt: string }) {
  const breaking = isBreaking(publishedAt);
  return (
    <span className="inline-flex items-center gap-2">
      {breaking && (
        <span className="inline-flex items-center gap-1">
          <span className="size-1.5 animate-pulse rounded-full bg-feed-danger" />
          <span className="font-mono text-[0.6rem] font-bold uppercase tracking-[0.16em] text-feed-danger">Breaking</span>
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span className={cn("size-1.5 rounded-full flex-none", CAT_DOT[category] ?? "bg-muted-foreground/40")} />
        <span className={cn("text-[0.65rem] font-semibold uppercase tracking-[0.14em]", CAT_TEXT[category] ?? "text-muted-foreground")}>
          {CAT_LABEL[category] ?? category}
        </span>
      </span>
    </span>
  );
}

// ─── dateline ─────────────────────────────────────────────────────────────────

function Dateline({ source, publishedAt, author }: { source: string; publishedAt: string; author?: string }) {
  return (
    <p className="font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground/60">
      {source}{author ? ` · ${author}` : ""} · {timeAgo(publishedAt)}
    </p>
  );
}

// ─── market ticker strip ──────────────────────────────────────────────────────

function MarketTicker({ tickers }: { tickers: Ticker[] }) {
  if (tickers.length === 0) return null;
  const items = [...tickers, ...tickers];
  return (
    <div className="overflow-hidden border-y border-hairline bg-background py-[7px]">
      <style>{`
        @keyframes mb-ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        .mb-ticker-track { animation: mb-ticker 55s linear infinite; }
        .mb-ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="flex w-max mb-ticker-track select-none">
        {items.map((t, i) => (
          <span key={i} className="flex items-center gap-2 px-5 text-nowrap">
            <span className="font-mono text-[0.68rem] font-semibold tabular-nums text-foreground/70">{t.symbol}</span>
            <span className="font-mono text-[0.68rem] tabular-nums text-foreground/55">{formatPrice(t.price)}</span>
            <span className={cn("font-mono text-[0.63rem] tabular-nums", t.changePct >= 0 ? "text-feed-ok" : "text-feed-danger")}>
              {formatChange(t.changePct)}
            </span>
            <span className="text-foreground/[0.1]">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── trending tag strip ───────────────────────────────────────────────────────

function TagStrip({
  tags,
  active,
  onSelect,
}: {
  tags: { tag: string; count: number }[];
  active: string | null;
  onSelect: (t: string | null) => void;
}) {
  if (tags.length === 0) return null;
  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex items-center gap-2 py-3">
        <span className="flex-none font-mono text-[0.58rem] uppercase tracking-[0.16em] text-muted-foreground/35">
          Trending
        </span>
        <div className="h-3 w-px flex-none bg-overlay-medium" />
        {tags.map(({ tag, count }) => {
          const isActive = active === tag;
          return (
            <button
              key={tag}
              type="button"
              onClick={() => onSelect(isActive ? null : tag)}
              className={cn(
                "flex-none inline-flex items-center gap-1.5 rounded-full px-3 py-[3px] text-[0.68rem] font-medium transition-colors",
                isActive
                  ? "bg-overlay-strong text-foreground ring-1 ring-hairline"
                  : "bg-overlay-weak text-muted-foreground hover:bg-overlay-medium hover:text-foreground",
              )}
            >
              {tag}
              <span className="font-mono text-[0.56rem] tabular-nums opacity-45">{count}</span>
            </button>
          );
        })}
        {active ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className="flex-none ml-1 flex items-center gap-1 text-[0.65rem] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            <X className="size-2.5" />
            clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ─── hero article ─────────────────────────────────────────────────────────────

function HeroArticle({ article }: { article: NewsArticle }) {
  return (
    <Link
      href={article.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex min-w-0 flex-col gap-3 py-1 outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
      <h2 className="text-[1.9rem] font-bold leading-[1.08] tracking-[-0.01em] text-foreground transition-opacity group-hover:opacity-80 sm:text-[2.3rem] lg:text-[2.7rem]">
        <HeadlineText text={article.title} />
      </h2>
      <div className="h-px bg-hairline-strong" />
      {article.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.thumbnail}
          alt=""
          className="aspect-video w-full rounded object-cover opacity-90 transition-opacity group-hover:opacity-75"
          loading="lazy"
        />
      ) : null}
      {article.description ? (
        <p className="text-[0.95rem] leading-relaxed text-muted-foreground line-clamp-3">
          {article.description}
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-3">
        <Dateline source={article.source} publishedAt={article.publishedAt} author={article.author} />
        <ExternalLink className="size-3.5 flex-none text-muted-foreground/30 transition-colors group-hover:text-muted-foreground/70" />
      </div>
    </Link>
  );
}

// ─── sidebar article ──────────────────────────────────────────────────────────

function SideArticle({ article, last = false }: { article: NewsArticle; last?: boolean }) {
  return (
    <>
      <Link
        href={article.url}
        target="_blank"
        rel="noreferrer noopener"
        className="group flex min-w-0 flex-col gap-2 py-4 outline-none focus-visible:ring-1 focus-visible:ring-ring first:pt-0"
      >
        <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
        <h3 className="text-[1.05rem] font-bold leading-[1.2] tracking-[-0.01em] text-foreground transition-opacity group-hover:opacity-75 sm:text-[1.15rem]">
          <HeadlineText text={article.title} />
        </h3>
        <Dateline source={article.source} publishedAt={article.publishedAt} />
      </Link>
      {!last ? <div className="h-px bg-hairline" /> : null}
    </>
  );
}

// ─── grid article card ────────────────────────────────────────────────────────

function GridArticle({ article, featured = false }: { article: NewsArticle; featured?: boolean }) {
  return (
    <Link
      href={article.url}
      target="_blank"
      rel="noreferrer noopener"
      className="group flex min-w-0 flex-col outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {article.thumbnail ? (
        <div className={cn("relative w-full overflow-hidden bg-background", featured ? "aspect-[21/9]" : "aspect-video")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.thumbnail}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-65"
            loading="lazy"
          />
          <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background to-transparent" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <ArticleMeta category={article.category} publishedAt={article.publishedAt} />
        <h3 className={cn(
          "font-bold leading-[1.2] tracking-[-0.01em] text-foreground transition-opacity group-hover:opacity-75",
          featured ? "text-[1.35rem] sm:text-[1.55rem]" : "text-[1.0rem] sm:text-[1.08rem]",
        )}>
          <HeadlineText text={article.title} />
        </h3>
        {article.description ? (
          <p className={cn(
            "leading-relaxed text-muted-foreground/80",
            featured ? "text-[0.88rem] line-clamp-3" : "text-[0.78rem] line-clamp-2",
          )}>
            {article.description}
          </p>
        ) : null}
        <Dateline source={article.source} publishedAt={article.publishedAt} />
      </div>
    </Link>
  );
}

// ─── clip grid card ───────────────────────────────────────────────────────────

function ClipGridCard({ clip, onClick }: { clip: Clip; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-lg bg-overlay-weak text-left transition-colors hover:bg-overlay-medium"
    >
      <span className="relative flex aspect-video items-center justify-center overflow-hidden bg-background">
        {clip.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnail} alt={clip.title} className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-75" />
        ) : (
          <ClipSourceIcon platform={clip.platform} className="size-7 opacity-[0.08]" />
        )}
        <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          {/* Play + duration overlay a clip thumbnail — fixed white-on-black, theme-independent. */}
          <span className="flex size-9 items-center justify-center rounded-full border border-white/15 bg-black/50 backdrop-blur-sm">
            <Play className="size-3.5 translate-x-px fill-white text-white" />
          </span>
        </span>
        {clip.duration ? (
          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[0.58rem] tabular-nums text-white/90">
            {clip.duration}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1 px-2.5 py-2">
        <span className="line-clamp-2 text-[0.78rem] font-medium leading-snug text-foreground">{clip.title}</span>
        <span className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground/55">
          <ClipSourceIcon platform={clip.platform} className="size-2.5 flex-none" />
          {clip.views > 0 ? `${formatCount(clip.views)} views` : clip.channel}
        </span>
      </span>
    </button>
  );
}

// ─── section rule ─────────────────────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="h-px flex-1 bg-hairline" />
      <span className="font-mono text-[0.62rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground/55">
        {label}
      </span>
      <div className="h-px flex-1 bg-hairline" />
    </div>
  );
}

// ─── skeleton loader ──────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-overlay-weak", className)} />;
}

function NewsLoader() {
  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-4">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-px w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-3 w-36" />
        </div>
        <div className="space-y-5 pt-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2.5">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function NewsContent() {
  const [articles, setArticles] = useState<NewsArticle[] | null>(null);
  const [pendingArticles, setPendingArticles] = useState<NewsArticle[] | null>(null);
  const [clips, setClips] = useState<Clip[]>(MOCK_CLIPS);
  const [dialogClip, setDialogClip] = useState<Clip | null>(null);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [fearGreed, setFearGreed] = useState<FearGreed | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  // Initial data fetches
  useEffect(() => {
    fetch("/api/markets/news")
      .then((r) => r.json())
      .then((d: NewsArticle[]) => {
        const list = Array.isArray(d) ? d : [];
        setArticles(list);
        list.forEach((a) => knownIdsRef.current.add(a.id));
      })
      .catch(() => setArticles([]));

    const clipsParams = new URLSearchParams({ login: "fazebanks", youtube: "MarketBubble" });
    fetch(`/api/clips?${clipsParams}`)
      .then((r) => r.json())
      .then((d: Clip[]) => { if (Array.isArray(d) && d.length > 0) setClips(d); })
      .catch(() => {});

    fetch("/api/markets/quotes")
      .then((r) => r.json())
      .then((d: Ticker[]) => { if (Array.isArray(d)) setTickers(d); })
      .catch(() => {});

    fetch("/api/markets/fear-greed")
      .then((r) => r.json())
      .then((d: FearGreed) => { if (typeof d.value === "number") setFearGreed(d); })
      .catch(() => {});
  }, []);

  // Refresh tickers every 30s
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/markets/quotes")
        .then((r) => r.json())
        .then((d: Ticker[]) => { if (Array.isArray(d)) setTickers(d); })
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  // Poll for new articles every 5 min
  useEffect(() => {
    const id = setInterval(() => {
      fetch("/api/markets/news")
        .then((r) => r.json())
        .then((d: NewsArticle[]) => {
          if (!Array.isArray(d)) return;
          const hasNew = d.some((a) => !knownIdsRef.current.has(a.id));
          if (hasNew) setPendingArticles(d);
        })
        .catch(() => {});
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const acceptPending = () => {
    if (!pendingArticles) return;
    pendingArticles.forEach((a) => knownIdsRef.current.add(a.id));
    setArticles(pendingArticles);
    setPendingArticles(null);
    setActiveTag(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Trending tags — top 8 by frequency across all articles
  const trendingTags = useMemo(() => {
    if (!articles) return [];
    const counts = new Map<string, number>();
    for (const a of articles) {
      for (const tag of a.tags ?? []) {
        const t = tag.trim();
        if (t.length < 3) continue;
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [articles]);

  // Filter articles by active tag
  const displayArticles = useMemo(() => {
    if (!articles) return null;
    if (!activeTag) return articles;
    return articles.filter((a) => a.tags?.includes(activeTag));
  }, [articles, activeTag]);

  const [hero, ...rest] = displayArticles ?? [];
  const sidebar = rest.slice(0, 3);
  const grid = rest.slice(3);

  const newCount = pendingArticles?.filter((a) => !knownIdsRef.current.has(a.id)).length ?? 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">

      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <header className="pb-0">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
          <h1 className={cn(walburn.className, "text-5xl uppercase leading-none tracking-[0.02em] text-foreground sm:text-6xl lg:text-7xl")}>
            MarketBubble
          </h1>
          <div className="flex flex-col items-start gap-1.5 sm:items-end sm:pb-1">
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground/70">
              {formatMastDate()}
            </span>
            {fearGreed ? <FearGreedBadge value={fearGreed.value} classification={fearGreed.classification} /> : null}
          </div>
        </div>

        <div className="mt-3 space-y-[3px]">
          <div className="h-[2px] bg-hairline-strong" />
          <div className="h-px bg-hairline" />
        </div>

        <p className="mt-2.5 text-center font-mono text-[0.65rem] uppercase tracking-[0.22em] text-muted-foreground/70">
          Financial Intelligence · Crypto · Markets · Trading
        </p>

        <div className="mt-2.5 h-px bg-hairline" />
      </header>

      {/* ── Market ticker strip ───────────────────────────────────────────── */}
      <div className="mt-4">
        <MarketTicker tickers={tickers} />
      </div>

      {/* ── Trending tags ─────────────────────────────────────────────────── */}
      <TagStrip tags={trendingTags} active={activeTag} onSelect={setActiveTag} />

      {/* ── New stories banner ────────────────────────────────────────────── */}
      {pendingArticles ? (
        <button
          type="button"
          onClick={acceptPending}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-hairline bg-overlay-weak py-2.5 text-[0.75rem] font-medium text-foreground/80 transition-colors hover:bg-overlay-medium hover:text-foreground"
        >
          <RefreshCw className="size-3.5 text-accent-violet" />
          {newCount} new {newCount === 1 ? "story" : "stories"} — click to load
        </button>
      ) : null}

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="mt-5">
        {articles === null ? (
          <NewsLoader />
        ) : displayArticles?.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <p className={cn(walburn.className, "text-2xl uppercase text-muted-foreground/40")}>No stories</p>
            {activeTag ? (
              <p className="text-sm text-muted-foreground/60">
                No articles tagged <span className="text-foreground/70">&ldquo;{activeTag}&rdquo;</span> —{" "}
                <button type="button" onClick={() => setActiveTag(null)} className="underline underline-offset-2 hover:text-foreground/80 transition-colors">
                  clear filter
                </button>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground/60">Check back shortly — feeds refresh every 5 minutes</p>
            )}
          </div>
        ) : (
          <>
            {/* ── Head: full-width hero + article sidebar ─────────────────── */}
            {hero ? (
              <div className="grid grid-cols-1 gap-0 lg:grid-cols-[3fr_2fr] lg:divide-x lg:divide-hairline">
                <div className="pr-0 lg:pr-8">
                  <HeroArticle article={hero} />
                </div>
                <div className="border-t border-hairline pl-0 pt-6 lg:border-t-0 lg:pl-8 lg:pt-0">
                  {sidebar.map((a, i) => (
                    <SideArticle key={a.id} article={a} last={i === sidebar.length - 1} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── Recent clips: horizontal row ────────────────────────────── */}
            {!activeTag ? (
              <div className="mt-8">
                <SectionRule label="Recent Clips & Broadcasts" />
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {clips.slice(0, 5).map((clip) => (
                    <ClipGridCard key={clip.id} clip={clip} onClick={() => setDialogClip(clip)} />
                  ))}
                </div>
              </div>
            ) : null}

            {/* ── Latest: full-width newspaper grid ───────────────────────── */}
            {grid.length > 0 ? (
              <div className="mt-8">
                <SectionRule label={activeTag ? `Tagged "${activeTag}"` : "Latest"} />
                <div className="mt-1 grid grid-cols-1 gap-px bg-hairline sm:grid-cols-2 lg:grid-cols-4">
                  {grid.map((a, i) => {
                    const featured = i === 0;
                    return (
                      <div key={a.id} className={cn("bg-background", featured && "sm:col-span-2")}>
                        <GridArticle article={a} featured={featured} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-10 border-t border-hairline pt-5">
        <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:justify-between">
          <span className={cn(walburn.className, "text-sm uppercase tracking-[0.08em] text-muted-foreground/50")}>
            MarketBubble News
          </span>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-muted-foreground/45">
            CoinDesk · CoinTelegraph · Decrypt · Yahoo Finance · Refreshed every 5 min
          </p>
        </div>
      </footer>

      <ClipsDialog
        clip={dialogClip}
        clips={clips}
        onClose={() => setDialogClip(null)}
        onSelect={(c) => setDialogClip(c)}
      />
    </div>
  );
}

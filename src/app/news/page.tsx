import type { Metadata } from "next";

import { PageShell } from "@/components/page/page-shell";
import { NewsContent } from "@/components/news/news-content";

// No per-page `openGraph`/`twitter` overrides — Next 15 replaces those blocks wholesale and
// would drop the layout's `card`, `site`, `creator`, and image. Title/description below
// flow into `og:title`/`og:description`/`twitter:title`/`twitter:description` automatically.
export const metadata: Metadata = {
  title: "News",
  description:
    "Live crypto and markets news, curated for the Market Bubble community — surfaced as it breaks from CoinDesk, CoinTelegraph, Decrypt and Yahoo Finance.",
  alternates: { canonical: "/news" },
};

export default function NewsPage() {
  return (
    <PageShell>
      <NewsContent />
    </PageShell>
  );
}

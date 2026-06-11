import type { Metadata } from "next";

import { PageShell } from "@/components/page/page-shell";
import { NewsContent } from "@/components/news/news-content";

export const metadata: Metadata = {
  title: "News",
  description: "Live financial news from crypto and markets — curated for the MarketBubble community.",
  alternates: { canonical: "/news" },
};

export default function NewsPage() {
  return (
    <PageShell>
      <NewsContent />
    </PageShell>
  );
}

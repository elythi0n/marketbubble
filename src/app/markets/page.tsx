import type { Metadata } from "next";

import { MarketsView } from "@/components/markets/markets-view";

// Per-page `openGraph`/`twitter` overrides intentionally dropped — see other pages for why.
export const metadata: Metadata = {
  title: "Markets",
  description:
    "Live markets, charts, heatmaps and signals on Market Bubble — crypto and equities side by side, surfaced where the show talks about them.",
  alternates: { canonical: "/markets" },
};

export default function MarketsPage() {
  return <MarketsView />;
}

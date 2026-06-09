import type { Metadata } from "next";

import { MarketsView } from "@/components/markets/markets-view";

export const metadata: Metadata = {
  title: "Markets",
  description: "Live markets, charts, heatmaps, and signals on MarketBubble.",
  alternates: { canonical: "/markets" },
};

export default function MarketsPage() {
  return <MarketsView />;
}

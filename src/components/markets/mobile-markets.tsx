"use client";

import { FearGreedWidget } from "./fear-greed-widget";
import { LiveWatchlist } from "./live-watchlist";
import { MoversWidget } from "./movers-widget";
import { AdvancedChart, CryptoHeatmap } from "./tradingview";

function Card({ height, children }: { height: string; children: React.ReactNode }) {
  return <div className={`overflow-hidden rounded-lg border border-white/[0.08] ${height}`}>{children}</div>;
}

/** Stacked, scrollable markets for mobile (dockview is desktop-only). */
export function MobileMarkets() {
  return (
    <div className="flex flex-col gap-3 p-3">
      <Card height="h-[46dvh]">
        <AdvancedChart />
      </Card>
      <Card height="h-[42dvh]">
        <LiveWatchlist />
      </Card>
      <Card height="h-[38dvh]">
        <MoversWidget />
      </Card>
      <Card height="h-[32dvh]">
        <FearGreedWidget />
      </Card>
      <Card height="h-[44dvh]">
        <CryptoHeatmap />
      </Card>
    </div>
  );
}

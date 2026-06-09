"use client";

import { DockviewReact, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";

import { DockTab } from "@/components/dashboard/dock-tab";
import { FearGreedWidget } from "./fear-greed-widget";
import { LiveWatchlist } from "./live-watchlist";
import { MarketHeaderActions } from "./market-header-actions";
import { MoversWidget } from "./movers-widget";
import { AdvancedChart, CryptoHeatmap, EconomicCalendar, MarketScreener, StockHeatmap, TechnicalGauge } from "./tradingview";

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  chart: () => <AdvancedChart />,
  watchlist: () => <LiveWatchlist />,
  movers: () => <MoversWidget />,
  feargreed: () => <FearGreedWidget />,
  heatmapCrypto: () => <CryptoHeatmap />,
  heatmapStock: () => <StockHeatmap />,
  screener: () => <MarketScreener />,
  calendar: () => <EconomicCalendar />,
  tagauge: () => <TechnicalGauge />,
};

function onReady(event: DockviewReadyEvent) {
  const chart = event.api.addPanel({ id: "chart", component: "chart", title: "Chart" });

  const right = event.api.addPanel({
    id: "watchlist",
    component: "watchlist",
    title: "Watchlist",
    position: { referencePanel: "chart", direction: "right" },
  });
  right.group.api.setSize({ width: 340 });
  event.api.addPanel({ id: "movers", component: "movers", title: "Movers", position: { referenceGroup: right.group, direction: "within" } });
  event.api.addPanel({ id: "feargreed", component: "feargreed", title: "Fear & Greed", position: { referenceGroup: right.group, direction: "within" } });

  const bottom = event.api.addPanel({
    id: "heatmapCrypto",
    component: "heatmapCrypto",
    title: "Heatmap",
    position: { referenceGroup: chart.group, direction: "below" },
  });
  bottom.group.api.setSize({ height: 300 });
  event.api.addPanel({ id: "screener", component: "screener", title: "Screener", position: { referenceGroup: bottom.group, direction: "within" } });
  event.api.addPanel({ id: "calendar", component: "calendar", title: "Calendar", position: { referenceGroup: bottom.group, direction: "within" } });
  event.api.addPanel({ id: "tagauge", component: "tagauge", title: "Signals", position: { referenceGroup: bottom.group, direction: "within" } });

  event.api.getPanel("chart")?.api.setActive();
  event.api.getPanel("watchlist")?.api.setActive();
  event.api.getPanel("heatmapCrypto")?.api.setActive();
}

/** Customizable markets board: TradingView chart/heatmap/screener/calendar + live watchlist, movers,
 *  fear & greed. Widgets are draggable, resizable, closable, addable via the launcher, and poppable. */
export function MarketsDock() {
  return (
    <DockviewReact
      className="mb-dock dockview-theme-dark h-full w-full"
      components={components}
      defaultTabComponent={DockTab}
      rightHeaderActionsComponent={MarketHeaderActions}
      onReady={onReady}
    />
  );
}

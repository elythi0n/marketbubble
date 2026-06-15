"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef } from "react";
import { DockviewReact, type DockviewApi, type DockviewReadyEvent, type IDockviewPanelProps } from "dockview";
import "dockview/dist/styles/dockview.css";

import { DockTab } from "@/components/dashboard/dock-tab";
import { useChartSymbol } from "@/lib/markets/chart-symbol";
import { FearGreedWidget } from "./fear-greed-widget";
import { LiveWatchlist } from "./live-watchlist";
import { MarketHeaderActions } from "./market-header-actions";
import { MoversWidget } from "./movers-widget";
import { AdvancedChart, CryptoHeatmap, EconomicCalendar, MarketScreener, StockHeatmap, TechnicalGauge } from "./tradingview";

/** Wraps AdvancedChart so it reacts to setChartSymbol from the watchlist (and anywhere else
 *  that pushes a symbol to the store). The TradingView widget re-renders cleanly on prop change. */
function ChartPanel() {
  const symbol = useChartSymbol();
  return <AdvancedChart symbol={symbol} />;
}

// Reuse the dashboard's panes — same components, same data, just opened on the markets board.
// Dynamic so they only load when first opened on this page.
const paneLoading = () => <div className="h-full w-full bg-card" />;
const NewsPane = dynamic(() => import("@/components/dashboard/news-pane").then((m) => m.NewsPane), { ssr: false, loading: paneLoading });
const PredictionsPane = dynamic(() => import("@/components/dashboard/predictions-pane").then((m) => m.PredictionsPane), { ssr: false, loading: paneLoading });
const HyperliquidPane = dynamic(() => import("@/components/dashboard/hyperliquid-pane").then((m) => m.HyperliquidPane), { ssr: false, loading: paneLoading });

// Per-visitor layout persistence. Distinct key from the dashboard's "mb-dock-layout-v2" so the
// two boards keep their own arrangements. Bump the version suffix when the default layout
// changes in a way that should override saved state.
const STORAGE_KEY = "mb-markets-layout-v1";

const REQUIRED_PANELS = ["chart"] as const;

const components: Record<string, React.FC<IDockviewPanelProps>> = {
  chart: () => <ChartPanel />,
  watchlist: () => <LiveWatchlist />,
  movers: () => <MoversWidget />,
  feargreed: () => <FearGreedWidget />,
  heatmapCrypto: () => <CryptoHeatmap />,
  heatmapStock: () => <StockHeatmap />,
  screener: () => <MarketScreener />,
  calendar: () => <EconomicCalendar />,
  tagauge: () => <TechnicalGauge />,
  news: () => <NewsPane />,
  predictions: () => <PredictionsPane />,
  hyperliquid: () => <HyperliquidPane />,
};

function buildDefault(api: DockviewApi) {
  const chart = api.addPanel({ id: "chart", component: "chart", title: "Chart" });

  const right = api.addPanel({
    id: "watchlist",
    component: "watchlist",
    title: "Watchlist",
    position: { referencePanel: "chart", direction: "right" },
  });
  right.group.api.setSize({ width: 340 });
  api.addPanel({ id: "movers", component: "movers", title: "Movers", position: { referenceGroup: right.group, direction: "within" } });
  api.addPanel({ id: "feargreed", component: "feargreed", title: "Fear & Greed", position: { referenceGroup: right.group, direction: "within" } });

  const bottom = api.addPanel({
    id: "heatmapCrypto",
    component: "heatmapCrypto",
    title: "Heatmap",
    position: { referenceGroup: chart.group, direction: "below" },
  });
  bottom.group.api.setSize({ height: 300 });
  api.addPanel({ id: "screener", component: "screener", title: "Screener", position: { referenceGroup: bottom.group, direction: "within" } });
  api.addPanel({ id: "calendar", component: "calendar", title: "Calendar", position: { referenceGroup: bottom.group, direction: "within" } });
  api.addPanel({ id: "tagauge", component: "tagauge", title: "Signals", position: { referenceGroup: bottom.group, direction: "within" } });

  api.getPanel("chart")?.api.setActive();
  api.getPanel("watchlist")?.api.setActive();
  api.getPanel("heatmapCrypto")?.api.setActive();
}

function persist(api: DockviewApi) {
  // Never save an empty layout — protects against saves during teardown.
  if (api.panels.length === 0) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(api.toJSON()));
  } catch {}
}

/** Wire persistence listeners. Returns a cleanup function that must be called on unmount. */
function wirePersistence(api: DockviewApi): () => void {
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist(api), 400);
  };

  const subscription = api.onDidLayoutChange(scheduleSave);
  window.addEventListener("mouseup", scheduleSave, { passive: true });

  return () => {
    subscription.dispose();
    if (saveTimer) clearTimeout(saveTimer);
    window.removeEventListener("mouseup", scheduleSave);
  };
}

/** Customizable markets board: TradingView chart/heatmap/screener/calendar + live watchlist, movers,
 *  fear & greed, plus the dashboard's news/predictions/hyperliquid feeds. Layout persists per visitor
 *  in localStorage; widgets are draggable, resizable, closable, addable via the launcher, and poppable. */
export function MarketsDock() {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const { api } = event;

    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        api.fromJSON(JSON.parse(raw));
        // Validate that every required panel survived the restore.
        const ids = new Set(api.panels.map((p) => p.id));
        if (REQUIRED_PANELS.every((id) => ids.has(id))) {
          cleanupRef.current = wirePersistence(api);
          return;
        }
      } catch {}

      // Saved state was corrupt or is missing required panels — clear and rebuild.
      localStorage.removeItem(STORAGE_KEY);
      [...api.panels].forEach((p) => api.removePanel(p));
    }

    buildDefault(api);
    persist(api);
    cleanupRef.current = wirePersistence(api);
  }, []);

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

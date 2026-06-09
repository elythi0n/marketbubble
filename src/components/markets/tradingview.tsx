"use client";

import { useEffect, useRef } from "react";

/**
 * Generic TradingView embed loader. Each widget is a script that reads a JSON config and injects an
 * iframe; we recreate it on config change and clean it up on unmount. All themed dark/transparent so
 * they sit on the graphite surfaces.
 */
function TradingViewWidget({ scriptSrc, config }: { scriptSrc: string; config: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  const configKey = JSON.stringify(config);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    container.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "100%";
    widget.style.width = "100%";
    container.appendChild(widget);

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.async = true;
    script.innerHTML = configKey;
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [scriptSrc, configKey]);

  return <div ref={ref} className="tradingview-widget-container h-full w-full overflow-hidden" />;
}

const COMMON = { colorTheme: "dark", locale: "en", isTransparent: true, width: "100%", height: "100%" } as const;

export function AdvancedChart({ symbol = "BINANCE:BTCUSDT" }: { symbol?: string }) {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js"
      config={{
        autosize: true,
        symbol,
        interval: "60",
        timezone: "Etc/UTC",
        theme: "dark",
        style: "1",
        locale: "en",
        backgroundColor: "rgba(12,12,14,1)",
        gridColor: "rgba(255,255,255,0.06)",
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        details: false,
        calendar: false,
        support_host: "https://www.tradingview.com",
      }}
    />
  );
}

export function CryptoHeatmap() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-crypto-coins-heatmap.js"
      config={{
        ...COMMON,
        dataSource: "Crypto",
        blockSize: "market_cap_calc",
        blockColor: "24h_close_change|5",
        hasTopBar: false,
        isDataSetEnabled: false,
        isZoomEnabled: true,
        hasSymbolTooltip: true,
      }}
    />
  );
}

export function StockHeatmap() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js"
      config={{
        ...COMMON,
        dataSource: "SPX500",
        blockSize: "market_cap_basic",
        blockColor: "change",
        grouping: "sector",
        hasTopBar: false,
        isDataSetEnabled: false,
        isZoomEnabled: true,
        hasSymbolTooltip: true,
      }}
    />
  );
}

export function MarketScreener({ screener = "crypto_mkt" }: { screener?: string }) {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-screener.js"
      config={{
        ...COMMON,
        defaultColumn: "overview",
        defaultScreen: "general",
        market: "crypto",
        screener_type: screener,
        displayCurrency: "USD",
      }}
    />
  );
}

export function EconomicCalendar() {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
      config={{ ...COMMON, importanceFilter: "0,1", countryFilter: "us,eu,gb,jp,cn" }}
    />
  );
}

export function TechnicalGauge({ symbol = "BINANCE:BTCUSDT" }: { symbol?: string }) {
  return (
    <TradingViewWidget
      scriptSrc="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"
      config={{
        ...COMMON,
        symbol,
        interval: "1D",
        showIntervalTabs: true,
        displayMode: "single",
      }}
    />
  );
}

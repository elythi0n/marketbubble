"use client";

import { useCallback, useEffect, useState } from "react";

import type { TradeRow } from "@/app/api/hyperliquid/trades/route";
import type { LeaderTrader } from "@/app/api/leaderboard/traders/route";

const TRADES_POLL_MS = 10_000;
const TRADERS_POLL_MS = 120_000;
const HL_EXPLORER_TX = "https://app.hyperliquid.xyz/explorer/tx";
const HYPERSTATS_WALLET = "https://hyperstats.org/wallet";

type View = "trades" | "traders";

function shortAddress(addr: string): string {
  if (addr.length <= 10) return addr;
  const a = addr.startsWith("0x") ? addr : `0x${addr}`;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** USD with M/K compaction and a signed prefix — used by the trader pnl column. */
function formatUsd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function TradesView() {
  const [trades, setTrades] = useState<TradeRow[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/hyperliquid/trades");
        if (!res.ok || !alive) return;
        const data = (await res.json()) as TradeRow[];
        if (data.length > 0) setTrades(data);
      } catch {
        /* keep last known */
      }
    };
    void load();
    const id = setInterval(() => void load(), TRADES_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (trades.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-[0.72rem] text-muted-foreground/40">Loading…</span>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto mb-scroll">
      {trades.map((t) => {
        // Strip the trade-id suffix from the composed React key (`hash-tid`) so the explorer
        // gets the bare tx hash — trades for the same block share a tid but not a row id.
        const hash = t.id.split("-")[0];
        const href = `${HL_EXPLORER_TX}/${hash}`;
        return (
          <li key={t.id}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              title={`View ${t.shortHash} on Hyperliquid Explorer`}
              className="flex items-center gap-3 border-b border-hairline px-3 py-2 transition-colors hover:bg-overlay-weak"
            >
              <span className="w-[5.5rem] shrink-0 truncate font-mono text-[0.68rem] text-muted-foreground/60">
                {t.shortHash}
              </span>
              <span className="w-10 shrink-0 font-mono text-[0.8rem] font-semibold text-foreground">{t.asset}</span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide ${
                  t.side === "long" ? "bg-feed-ok/15 text-feed-ok" : "bg-feed-danger/15 text-feed-danger"
                }`}
              >
                {t.side}
              </span>
              <span className="ml-auto font-mono text-[0.74rem] tabular-nums text-muted-foreground">{t.size}</span>
              <span className="w-[5rem] shrink-0 text-right font-mono text-[0.74rem] tabular-nums text-foreground/70">
                {t.price}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

function TradersView() {
  const [traders, setTraders] = useState<LeaderTrader[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/leaderboard/traders");
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { traders?: LeaderTrader[] };
        if (alive) {
          setTraders(data.traders ?? []);
          setLoading(false);
        }
      } catch {
        if (alive) setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), TRADERS_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (loading && traders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-[0.72rem] text-muted-foreground/40">Loading…</span>
      </div>
    );
  }

  if (traders.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <span className="text-[0.72rem] text-muted-foreground">No traders right now.</span>
      </div>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto mb-scroll">
      {traders.map((t, i) => {
        const up = t.pnl30dUsd >= 0;
        return (
          <li key={t.address}>
            <a
              href={`${HYPERSTATS_WALLET}/${t.address}`}
              target="_blank"
              rel="noopener noreferrer"
              title={`View ${shortAddress(t.address)} on Hyperstats`}
              className="flex items-center gap-3 border-b border-hairline px-3 py-2 transition-colors hover:bg-overlay-weak"
            >
              <span className="w-5 shrink-0 text-right font-mono text-[0.66rem] tabular-nums text-muted-foreground/60">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[0.78rem] font-semibold text-foreground">
                  {shortAddress(t.address)}
                </span>
                <span className="block truncate text-[0.6rem] text-muted-foreground/80">
                  {t.mainToken || "—"} · {t.winRate}% win
                  {t.bias ? ` · ${t.bias}` : ""}
                </span>
              </span>
              {t.grade ? (
                <span className="shrink-0 rounded bg-overlay-medium px-1.5 py-0.5 font-mono text-[0.6rem] font-semibold text-foreground/90">
                  {t.grade}
                </span>
              ) : null}
              <span
                className={`w-20 shrink-0 text-right font-mono text-[0.74rem] font-semibold tabular-nums ${
                  up ? "text-feed-ok" : "text-feed-danger"
                }`}
              >
                {formatUsd(t.pnl30dUsd)}
              </span>
              <span
                className={`w-12 shrink-0 text-right font-mono text-[0.66rem] tabular-nums ${
                  up ? "text-feed-ok/80" : "text-feed-danger/80"
                }`}
              >
                {up ? "+" : ""}
                {t.pnl30d.toFixed(0)}%
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function HyperliquidPane() {
  const [view, setView] = useState<View>("trades");

  const tabClass = useCallback(
    (active: boolean) =>
      `rounded-md px-2 py-0.5 text-[0.66rem] font-medium uppercase tracking-[0.08em] transition-colors ${
        active
          ? "bg-overlay-medium text-foreground"
          : "text-muted-foreground hover:bg-overlay-weak hover:text-foreground"
      }`,
    [],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-hairline px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Hyperliquid
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setView("trades")} className={tabClass(view === "trades")}>
            Trades
          </button>
          <button type="button" onClick={() => setView("traders")} className={tabClass(view === "traders")}>
            Traders
          </button>
        </div>
      </header>

      {view === "trades" ? <TradesView /> : <TradersView />}
    </div>
  );
}

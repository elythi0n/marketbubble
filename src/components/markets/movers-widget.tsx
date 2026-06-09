"use client";

import { useEffect, useState } from "react";

import { formatPrice } from "@/lib/markets/types";

interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

function Column({ title, rows, up }: { title: string; rows: Mover[]; up: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <h3 className={`mb-1.5 px-3 pt-2 text-[0.6rem] font-semibold uppercase tracking-[0.14em] ${up ? "text-[#46c45a]" : "text-[#ef6a61]"}`}>
        {title}
      </h3>
      <ul>
        {rows.map((m) => (
          <li key={m.symbol} className="flex items-center gap-2 px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[0.78rem] font-semibold text-foreground">{m.symbol}</span>
            <span className="font-mono text-[0.7rem] tabular-nums text-muted-foreground">${formatPrice(m.price)}</span>
            <span className={`w-16 text-right font-mono text-[0.72rem] font-medium tabular-nums ${up ? "text-[#46c45a]" : "text-[#ef6a61]"}`}>
              {m.changePct > 0 ? "+" : ""}
              {m.changePct.toFixed(1)}%
            </span>
          </li>
        ))}
        {rows.length === 0 ? <li className="px-3 py-2 text-[0.72rem] text-muted-foreground">Loading…</li> : null}
      </ul>
    </div>
  );
}

export function MoversWidget() {
  const [data, setData] = useState<{ gainers: Mover[]; losers: Mover[] }>({ gainers: [], losers: [] });

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/markets/movers")
        .then((r) => r.json())
        .then((d) => alive && setData(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-card">
      <header className="flex h-9 flex-none items-center gap-2 border-b border-white/[0.07] px-3">
        <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Movers</span>
        <span className="ml-auto text-[0.62rem] text-muted-foreground/80">24h</span>
      </header>
      <div className="flex flex-1 divide-x divide-white/[0.06] overflow-y-auto mb-scroll">
        <Column title="Gainers" rows={data.gainers} up />
        <Column title="Losers" rows={data.losers} up={false} />
      </div>
    </div>
  );
}

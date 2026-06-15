"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { AdminStatsPayload } from "@/app/api/admin/stats/route";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "1h", ms: 3600_000 },
  { label: "6h", ms: 6 * 3600_000 },
  { label: "24h", ms: 24 * 3600_000 },
  { label: "7d", ms: 7 * 24 * 3600_000 },
  { label: "30d", ms: 30 * 24 * 3600_000 },
];

const PALETTE = ["#46c45a", "#d8b25a", "#6aa7ef", "#ef6a61", "#b07aef", "#5ad8c9", "#ef9f5a"];

/** "viewers:kick:blknoiz06" → "blknoiz06 · kick"; relay metrics get friendly names. */
function metricLabel(metric: string): string {
  if (metric === "relay:clients") return "chat clients";
  if (metric === "relay:mps") return "chat msg/s";
  const m = /^viewers:([^:]+):(.+)$/.exec(metric);
  return m ? `${m[2]} · ${m[1]}` : metric;
}

function formatTick(ts: number, rangeMs: number): string {
  const d = new Date(ts);
  return rangeMs <= 24 * 3600_000
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

const W = 800;
const H = 230;
const PAD = { top: 12, right: 14, bottom: 26, left: 46 };

/**
 * Viewer/relay time-series for the admin Health tab: range presets, prev/next window
 * navigation, click-to-toggle series. Renders plain SVG — no chart dependency.
 */
export interface ChartPin {
  end: number | null;
  rangeMs: number;
}

export function AnalyticsPanel({
  call,
  enabled,
  pin,
}: {
  /** Authenticated fetch from the admin board (adds x-admin-key). */
  call: (path: string) => Promise<Response>;
  /** Whether the database is connected (graphs need persisted samples). */
  enabled: boolean;
  /** External window request (e.g. clicking a heatmap day); each new object reposition the chart. */
  pin?: ChartPin | null;
}) {
  const [rangeMs, setRangeMs] = useState(24 * 3600_000);
  /** Window end; null = "now" (follows live, refreshes every minute). */
  const [end, setEnd] = useState<number | null>(null);
  useEffect(() => {
    if (!pin) return;
    setRangeMs(pin.rangeMs);
    setEnd(pin.end);
  }, [pin]);
  const [data, setData] = useState<AdminStatsPayload | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return;
    const to = end ?? Date.now();
    try {
      const res = await call(`/api/admin/stats?from=${to - rangeMs}&to=${to}`);
      if (!res.ok) {
        setErr(`stats unavailable (${res.status})`);
        return;
      }
      setErr("");
      setData((await res.json()) as AdminStatsPayload);
    } catch {
      setErr("stats unavailable");
    }
  }, [call, enabled, end, rangeMs]);

  useEffect(() => {
    void load();
    if (end !== null) return; // a pinned window is historical — nothing to refresh
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load, end]);

  const metrics = useMemo(() => Object.keys(data?.series ?? {}).sort(), [data]);
  const windowTo = data?.to ?? end ?? Date.now();
  const windowFrom = data?.from ?? windowTo - rangeMs;

  const visible = metrics.filter((m) => !hidden.has(m));
  const yMax = Math.max(1, ...visible.flatMap((m) => (data?.series[m] ?? []).map(([, v]) => v)));

  const x = (ts: number) => PAD.left + ((ts - windowFrom) / (windowTo - windowFrom)) * (W - PAD.left - PAD.right);
  const y = (v: number) => H - PAD.bottom - (v / yMax) * (H - PAD.top - PAD.bottom);

  // ── Cursor highlight: snap to the nearest sample bucket, show a crosshair + readout ─────────
  const [hover, setHover] = useState<number | null>(null);
  const seriesMaps = useMemo(() => {
    const maps: Record<string, Map<number, number>> = {};
    for (const [m, pts] of Object.entries(data?.series ?? {})) maps[m] = new Map(pts);
    return maps;
  }, [data]);

  const onChartMove = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (!data) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xv = ((e.clientX - rect.left) / rect.width) * W;
    const t = windowFrom + ((xv - PAD.left) / (W - PAD.left - PAD.right)) * (windowTo - windowFrom);
    const snapped = Math.round(t / data.bucketMs) * data.bucketMs;
    setHover(snapped >= windowFrom && snapped <= windowTo ? snapped : null);
  };

  const hoverRows =
    hover === null
      ? []
      : visible
          .map((m) => ({ metric: m, value: seriesMaps[m]?.get(hover), color: PALETTE[metrics.indexOf(m) % PALETTE.length] }))
          .filter((r): r is { metric: string; value: number; color: string } => r.value !== undefined)
          .sort((a, b) => b.value - a.value);

  if (!enabled) {
    return (
      <p className="text-[0.78rem] text-muted-foreground">
        Requires the database — set <code className="rounded bg-overlay-weak px-1 py-0.5 text-[0.7rem]">DATABASE_PATH</code> to
        record viewer history and chat stats across restarts.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Range presets + window navigation */}
      <div className="flex flex-wrap items-center gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => {
              // Presets always mean "the last X from now" — clear any pinned historical window.
              setRangeMs(r.ms);
              setEnd(null);
            }}
            className={cn(
              "rounded-md px-2 py-1 text-[0.7rem] font-semibold transition-colors",
              rangeMs === r.ms ? "bg-overlay-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-overlay-medium" />
        <button
          type="button"
          aria-label="Earlier window"
          onClick={() => setEnd((end ?? Date.now()) - rangeMs)}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          aria-label="Later window"
          disabled={end === null}
          onClick={() => {
            const next = (end ?? Date.now()) + rangeMs;
            setEnd(next >= Date.now() ? null : next);
          }}
          className="rounded-md p-1 text-muted-foreground transition-colors enabled:hover:text-foreground disabled:opacity-30"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <span className="font-mono text-[0.68rem] tabular-nums text-muted-foreground">
          {formatTick(windowFrom, rangeMs)} — {end === null ? "now" : formatTick(windowTo, rangeMs)}
        </span>
      </div>

      {err ? (
        <p className="text-[0.78rem] text-muted-foreground">{err}</p>
      ) : metrics.length === 0 ? (
        <p className="text-[0.78rem] text-muted-foreground">
          No samples in this window yet — the sampler records every minute while a stream is live.
        </p>
      ) : (
        <>
          <div className="relative">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="Viewer history chart"
            onMouseMove={onChartMove}
            onMouseLeave={() => setHover(null)}
          >
            {/* Gridlines + y labels */}
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line
                  x1={PAD.left}
                  x2={W - PAD.right}
                  y1={y(yMax * f)}
                  y2={y(yMax * f)}
                  stroke="var(--hairline)"
                  strokeDasharray={f === 0 ? undefined : "3 4"}
                />
                <text x={PAD.left - 6} y={y(yMax * f) + 3} textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
                  {Math.round(yMax * f).toLocaleString()}
                </text>
              </g>
            ))}
            {/* x labels */}
            {[windowFrom, (windowFrom + windowTo) / 2, windowTo].map((ts, i) => (
              <text
                key={i}
                x={x(ts)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
                fontSize="10"
                fill="var(--muted-foreground)"
              >
                {formatTick(ts, rangeMs)}
              </text>
            ))}
            {/* Soft area washes under each series */}
            {visible.map((m) => {
              const pts = data?.series[m] ?? [];
              if (pts.length < 2) return null;
              const color = PALETTE[metrics.indexOf(m) % PALETTE.length];
              const line = pts.map(([ts, v]) => `${x(ts).toFixed(1)},${y(v).toFixed(1)}`).join(" L ");
              const d = `M ${line} L ${x(pts[pts.length - 1][0]).toFixed(1)},${y(0).toFixed(1)} L ${x(pts[0][0]).toFixed(1)},${y(0).toFixed(1)} Z`;
              return <path key={`a-${m}`} d={d} fill={color} opacity="0.08" />;
            })}
            {/* Series */}
            {visible.map((m) => {
              const pts = data?.series[m] ?? [];
              if (pts.length === 0) return null;
              const color = PALETTE[metrics.indexOf(m) % PALETTE.length];
              return (
                <polyline
                  key={m}
                  fill="none"
                  stroke={color}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pts.map(([ts, v]) => `${x(ts).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}
                />
              );
            })}
            {/* Crosshair + sample dots under the cursor */}
            {hover !== null && hoverRows.length > 0 ? (
              <g pointerEvents="none">
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={PAD.top}
                  y2={H - PAD.bottom}
                  stroke="var(--hairline-strong)"
                  strokeDasharray="3 3"
                />
                {hoverRows.map((r) => (
                  <circle key={r.metric} cx={x(hover)} cy={y(r.value)} r="3.4" fill={r.color} stroke="var(--sidebar)" strokeWidth="1.6" />
                ))}
              </g>
            ) : null}
          </svg>

          {/* Hover readout — flips sides past the chart midpoint */}
          {hover !== null && hoverRows.length > 0 ? (
            <div
              className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-hairline bg-card/95 px-2.5 py-2 shadow-[0_12px_32px_-10px_rgba(0,0,0,0.8)] backdrop-blur-sm"
              style={{
                left: `${(x(hover) / W) * 100}%`,
                transform: x(hover) > W * 0.62 ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
              }}
            >
              <p className="font-mono text-[0.64rem] tabular-nums text-muted-foreground">{formatTick(hover, rangeMs)}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {hoverRows.map((r) => (
                  <li key={r.metric} className="flex items-center gap-1.5 text-[0.68rem]">
                    <span className="size-1.5 flex-none rounded-full" style={{ backgroundColor: r.color }} />
                    <span className="text-foreground/85">{metricLabel(r.metric)}</span>
                    <span className="ml-auto pl-3 font-mono tabular-nums text-foreground">{r.value.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          </div>

          {/* Legend — click to toggle a series */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {metrics.map((m) => {
              const pts = data?.series[m] ?? [];
              const latest = pts.length ? pts[pts.length - 1][1] : 0;
              const off = hidden.has(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(m)) next.delete(m);
                      else next.add(m);
                      return next;
                    })
                  }
                  className={cn("flex items-center gap-1.5 text-[0.7rem] transition-opacity", off && "opacity-35")}
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: PALETTE[metrics.indexOf(m) % PALETTE.length] }}
                  />
                  <span className="text-foreground/85">{metricLabel(m)}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">{latest.toLocaleString()}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

import { NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";

/**
 * Public "recent broadcasts" derived from the analytics sampler: at each sampling pass we sum the
 * per-channel `viewers:*` rows into one combined count (shared X is already de-duplicated at write
 * time), then group contiguous runs of combined > 0 into broadcasts. Viewer counts are public
 * (they're visible on each platform), so no auth — same as the chatter leaderboard.
 */
export const dynamic = "force-dynamic";

export interface Broadcast {
  start: number;
  end: number;
  durationMin: number;
  peakCombined: number;
  avgCombined: number;
}

const RANGE_MS = 60 * 24 * 3600_000; // last 60 days
const GAP_MS = 15 * 60_000; // a hole longer than this splits a broadcast (idle cadence is 5 min)
const MIN_SESSION_MS = 10 * 60_000; // a real show runs at least ~10 min — drops API blips
const LIMIT = 8;

export function GET() {
  const db = getDb();
  if (!db) return NextResponse.json({ broadcasts: [] as Broadcast[] });

  const now = Date.now();
  const from = now - RANGE_MS;
  try {
    const rows = db
      .prepare(
        `SELECT ts, SUM(value) AS combined FROM stat_samples
         WHERE metric LIKE 'viewers:%' AND ts >= ? AND ts <= ?
         GROUP BY ts ORDER BY ts`,
      )
      .all(from, now) as Array<{ ts: number; combined: number }>;

    const broadcasts: Broadcast[] = [];
    let cur: { start: number; end: number; peak: number; sum: number; n: number } | null = null;
    const close = () => {
      if (cur && cur.end - cur.start >= MIN_SESSION_MS) {
        broadcasts.push({
          start: cur.start,
          end: cur.end,
          durationMin: Math.round((cur.end - cur.start) / 60_000),
          peakCombined: Math.round(cur.peak),
          avgCombined: Math.round(cur.sum / cur.n),
        });
      }
      cur = null;
    };

    for (const r of rows) {
      const live = r.combined > 0;
      if (cur && (!live || r.ts - cur.end > GAP_MS)) close();
      if (!live) continue;
      if (!cur) cur = { start: r.ts, end: r.ts, peak: r.combined, sum: 0, n: 0 };
      cur.end = r.ts;
      cur.peak = Math.max(cur.peak, r.combined);
      cur.sum += r.combined;
      cur.n += 1;
    }
    close();

    broadcasts.sort((a, b) => b.start - a.start);
    return NextResponse.json(
      { broadcasts: broadcasts.slice(0, LIMIT) },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    console.error("[api/broadcasts]", err);
    return NextResponse.json({ broadcasts: [] as Broadcast[] });
  }
}

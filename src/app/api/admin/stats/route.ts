import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

export interface AdminStatsPayload {
  from: number;
  to: number;
  bucketMs: number;
  /** metric → [bucket start ms, avg value][] — e.g. "viewers:kick:blknoiz06", "relay:clients". */
  series: Record<string, Array<[number, number]>>;
}

const MAX_RANGE_MS = 92 * 24 * 3600_000; // retention + slack
const TARGET_POINTS = 240;

/**
 * Bucketed time-series from stat_samples for the admin analytics graphs. The window is
 * `?from=&to=` (epoch ms); bucket size derives from the window so a chart always gets a
 * renderable number of points whether it spans an hour or a month.
 */
export async function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "no database configured" }, { status: 501 });

  const now = Date.now();
  const to = Math.min(Number(req.nextUrl.searchParams.get("to")) || now, now);
  const from = Math.max(Number(req.nextUrl.searchParams.get("from")) || to - 24 * 3600_000, to - MAX_RANGE_MS);
  if (!(from < to)) return NextResponse.json({ error: "from must precede to" }, { status: 400 });

  const bucketMs = Math.max(60_000, Math.round((to - from) / TARGET_POINTS / 60_000) * 60_000);

  try {
    const rows = await db.all<{ metric: string; bucket: number; value: number }>(
      `SELECT metric, CAST(ts / ? AS INTEGER) * ? AS bucket, AVG(value) AS value
       FROM stat_samples WHERE ts >= ? AND ts <= ?
       GROUP BY metric, bucket ORDER BY bucket`,
      [bucketMs, bucketMs, from, to],
    );

    const series: AdminStatsPayload["series"] = {};
    for (const r of rows) {
      (series[r.metric] ??= []).push([r.bucket, Math.round(r.value * 100) / 100]);
    }

    return NextResponse.json({ from, to, bucketMs, series } satisfies AdminStatsPayload);
  } catch (err) {
    console.error("[admin/stats]", err);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}

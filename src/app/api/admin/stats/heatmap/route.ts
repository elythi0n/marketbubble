import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";
import { adminAuthorized, adminEnabled } from "../../auth";

export const dynamic = "force-dynamic";

export interface AdminHeatmapPayload {
  /** Minutes behind UTC used for day bucketing (the client's Date.getTimezoneOffset()). */
  tz: number;
  /** day = floor((ts - tz·60000) / 86400000), i.e. local epoch-day index. */
  days: Array<{ day: number; peak: number }>;
}

const MAX_DAYS = 92; // retention + slack

/**
 * Daily peak of combined viewers (all roster channels summed per sampling pass) for the
 * GitHub-style activity heatmap. Samples within one pass share a timestamp, so SUM per ts
 * reconstructs "total concurrent viewers", and MAX per local day gives that day's top.
 */
export async function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ error: "no database configured" }, { status: 501 });

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || MAX_DAYS, 1), MAX_DAYS);
  const tz = Math.max(-840, Math.min(840, Number(req.nextUrl.searchParams.get("tz")) || 0));
  const from = Date.now() - days * 86_400_000;

  try {
    const rows = await db.all<{ day: number; peak: number }>(
      `SELECT CAST((ts - ?) / 86400000.0 AS INTEGER) AS day, MAX(total) AS peak FROM
         (SELECT ts, SUM(value) AS total FROM stat_samples WHERE metric LIKE 'viewers:%' AND ts >= ? GROUP BY ts)
       GROUP BY day ORDER BY day`,
      [tz * 60_000, from],
    );

    return NextResponse.json({
      tz,
      days: rows.map((r) => ({ day: r.day, peak: Math.round(r.peak) })),
    } satisfies AdminHeatmapPayload);
  } catch (err) {
    console.error("[admin/stats/heatmap]", err);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }
}

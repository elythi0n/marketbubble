import { type NextRequest, NextResponse } from "next/server";

import { getDb } from "@/lib/server/db";

export const dynamic = "force-dynamic";

export interface ChatterStatsPayload {
  /** All-time message count from the durable tally, or null when unknown (no db / never seen). */
  allTime: number | null;
  /** 1-based rank across all platforms by all-time count, or null when unknown. */
  rank: number | null;
  /** Last time the tally moved (ms), or null. */
  lastActive: number | null;
}

/**
 * Public per-chatter stats for the viewer user card — same durable tally the public
 * leaderboard exposes, looked up by name. Degrades to nulls without a database.
 */
export function GET(req: NextRequest) {
  const name = (req.nextUrl.searchParams.get("name") ?? "").trim().slice(0, 60);
  const platform = (req.nextUrl.searchParams.get("platform") ?? "").trim().slice(0, 10);
  if (!name || !platform) return NextResponse.json({ error: "name and platform required" }, { status: 400 });

  const empty: ChatterStatsPayload = { allTime: null, rank: null, lastActive: null };
  const db = getDb();
  if (!db) return NextResponse.json(empty);

  try {
    const row = db
      .prepare("SELECT count, updated_at FROM chatters WHERE platform = ? AND name = ? COLLATE NOCASE")
      .get(platform, name) as { count: number; updated_at: number } | undefined;
    if (!row) return NextResponse.json(empty);

    const { higher } = db.prepare("SELECT COUNT(*) AS higher FROM chatters WHERE count > ?").get(row.count) as {
      higher: number;
    };
    return NextResponse.json({
      allTime: row.count,
      rank: higher + 1,
      lastActive: row.updated_at,
    } satisfies ChatterStatsPayload);
  } catch (err) {
    console.error("[chatter]", err);
    return NextResponse.json(empty);
  }
}

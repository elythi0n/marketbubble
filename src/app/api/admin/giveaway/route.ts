import { type NextRequest, NextResponse } from "next/server";

import { clearGiveaway, startGiveaway, type Giveaway } from "@/lib/server/control";
import { getDb } from "@/lib/server/db";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

export interface GiveawayFilters {
  /** Restrict to one platform; null/absent = all platforms. */
  platform?: "twitch" | "kick" | "x" | null;
  /** Minimum messages a chatter must have sent to enter (default 1). */
  minCount?: number;
  /** Only chatters seen within the last N minutes; 0/absent = all-time. */
  activeWithinMin?: number;
}

export interface GiveawayPreview {
  eligible: number;
}

/** How many names ride the reel besides the winner — enough to feel like a crowd. */
const REEL_SIZE = 24;
const PLATFORMS = new Set(["twitch", "kick", "x"]);

interface ChatterRow {
  platform: string;
  name: string;
}

async function eligibleChatters(f: GiveawayFilters): Promise<ChatterRow[] | null> {
  const db = getDb();
  if (!db) return null;

  const where: string[] = ["count >= ?"];
  const params: Array<string | number> = [Math.max(1, Math.floor(f.minCount ?? 1))];
  if (f.platform && PLATFORMS.has(f.platform)) {
    where.push("platform = ?");
    params.push(f.platform);
  }
  if (f.activeWithinMin && f.activeWithinMin > 0) {
    where.push("updated_at >= ?");
    params.push(Date.now() - f.activeWithinMin * 60_000);
  }
  return db.all<ChatterRow>(`SELECT platform, name FROM chatters WHERE ${where.join(" AND ")}`, params);
}

function parseFilters(searchParams: URLSearchParams): GiveawayFilters {
  const platform = searchParams.get("platform");
  return {
    platform: platform && PLATFORMS.has(platform) ? (platform as GiveawayFilters["platform"]) : null,
    minCount: Number(searchParams.get("minCount")) || 1,
    activeWithinMin: Number(searchParams.get("activeWithinMin")) || 0,
  };
}

/** Preview: how many chatters the current filters would enter into the draw. */
export async function GET(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  const rows = await eligibleChatters(parseFilters(req.nextUrl.searchParams));
  if (rows === null) return NextResponse.json({ error: "no database configured" }, { status: 501 });
  return NextResponse.json({ eligible: rows.length } satisfies GiveawayPreview);
}

/**
 * Start a roll: pick a uniformly random winner from the eligible chatters, sample reel decoys,
 * and broadcast over the control stream. Every screen (admin + OBS overlay) replays the same
 * deceleration and lands on the winner together.
 */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: GiveawayFilters & { durationSec?: number };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const rows = await eligibleChatters(body);
  if (rows === null) return NextResponse.json({ error: "no database configured" }, { status: 501 });
  if (rows.length === 0) return NextResponse.json({ error: "no eligible chatters under these filters" }, { status: 422 });

  const winner = rows[Math.floor(Math.random() * rows.length)];

  // Reel: the winner plus a shuffled sample of other eligible names (deduped by display name).
  const others = rows.filter((r) => r.name !== winner.name).map((r) => r.name);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const names = [...new Set([...others.slice(0, REEL_SIZE), winner.name])];
  // Shuffle once more so the winner isn't always the last entry in the reel order.
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }

  const durationMs = Math.min(30, Math.max(3, Number(body.durationSec) || 8)) * 1000;
  const giveaway: Giveaway = startGiveaway({
    names,
    winner: winner.name,
    winnerPlatform: winner.platform,
    eligible: rows.length,
    durationMs,
  });
  return NextResponse.json({ giveaway });
}

export function DELETE(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  clearGiveaway();
  return NextResponse.json({ giveaway: null });
}

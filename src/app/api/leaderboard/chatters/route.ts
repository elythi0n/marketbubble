import { NextResponse } from "next/server";

import { getInProcessTopChatters } from "@/lib/server/chat-listener";
import { getDb } from "@/lib/server/db";
import { getTopChatters } from "@/lib/x/chat-buffer";

export const dynamic = "force-dynamic";

const RELAY_URL = process.env.RELAY_URL || process.env.NEXT_PUBLIC_RELAY_URL || "";

// True on Vercel — in-memory buffer resets on cold starts and is not shared across instances.
const ON_VERCEL = !!process.env.VERCEL;

export async function GET() {
  // ── Priority 0: the database (durable, all-time; accumulated by the stats sampler from the
  // relay's Twitch/Kick tallies plus per-message X counts — survives every restart) ──────────
  const db = getDb();
  if (db) {
    try {
      const rows = db
        .prepare("SELECT name, platform, count, sub FROM chatters ORDER BY count DESC LIMIT 15")
        .all() as Array<{ name: string; platform: string; count: number; sub: number }>;
      if (rows.length > 0) {
        return NextResponse.json({
          source: "All-time",
          chatters: rows.map((r) => ({ name: r.name, platform: r.platform, count: r.count, sub: r.sub === 1 })),
        });
      }
    } catch {
      /* fall through to relay */
    }
  }

  // ── Priority 1: external relay (Twitch + Kick aggregated) ─────────────────
  if (RELAY_URL) {
    try {
      const res = await fetch(`${RELAY_URL.replace(/\/$/, "")}/top-chatters?limit=15`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          source?: string;
          chatters?: Array<{ name: string; platform: string; count: number; sub?: boolean }>;
        };
        return NextResponse.json({
          source: json.source ?? "Live chat",
          chatters: Array.isArray(json.chatters)
            ? json.chatters.map((c) => ({ ...c, sub: c.sub === true }))
            : [],
        });
      }
    } catch {
      // Relay unreachable — fall through to buffer
    }
  }

  // ── Priority 2: in-process Twitch + Kick tally (this session only) merged with the X
  // buffer. Active when there's no relay; gives a full three-platform leaderboard even
  // without a database. Counts reset when the process restarts. ─────────────────────────
  const live = [
    ...getInProcessTopChatters(15),
    ...getTopChatters(15),
  ]
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map((c) => ({ name: c.name, platform: c.platform, count: c.count, sub: "sub" in c ? c.sub : false }));

  if (live.length > 0) {
    const source = ON_VERCEL
      ? "Live chat · resets on cold start"
      : "Live chat · current session";
    return NextResponse.json({ source, chatters: live });
  }

  // ── No data yet ───────────────────────────────────────────────────────────
  return NextResponse.json({ source: null, chatters: [] });
}

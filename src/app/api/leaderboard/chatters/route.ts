import { NextResponse } from "next/server";

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
      const rows = await db.all<{ name: string; platform: string; count: number; sub: number }>(
        "SELECT name, platform, count, sub FROM chatters ORDER BY count DESC LIMIT 15",
      );
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

  // ── Priority 2: X chat buffer (current process / warm instance) ───────────
  const chatters = getTopChatters(15);
  if (chatters.length > 0) {
    const source = ON_VERCEL
      ? "X chat · resets on cold start (set RELAY_URL for persistence)"
      : "X chat · current session";
    return NextResponse.json({ source, chatters });
  }

  // ── No data yet ───────────────────────────────────────────────────────────
  return NextResponse.json({ source: null, chatters: [] });
}

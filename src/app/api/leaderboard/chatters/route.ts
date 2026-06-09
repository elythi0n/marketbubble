import { NextResponse } from "next/server";

import { getTopChatters } from "@/lib/x/chat-buffer";

export const dynamic = "force-dynamic";

const RELAY_URL = process.env.RELAY_URL || process.env.NEXT_PUBLIC_RELAY_URL || "";

// True on Vercel — in-memory buffer resets on cold starts and is not shared across instances.
const ON_VERCEL = !!process.env.VERCEL;

export async function GET() {
  // ── Priority 1: external relay (Twitch + Kick + X aggregated) ─────────────
  if (RELAY_URL) {
    try {
      const res = await fetch(`${RELAY_URL.replace(/\/$/, "")}/top-chatters?limit=15`, {
        cache: "no-store",
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          source?: string;
          chatters?: Array<{ name: string; platform: string; count: number }>;
        };
        return NextResponse.json({
          source: json.source ?? "Live chat",
          chatters: Array.isArray(json.chatters) ? json.chatters : [],
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

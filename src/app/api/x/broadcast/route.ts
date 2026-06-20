import { type NextRequest, NextResponse } from "next/server";

import { resolvePlayback } from "@/lib/x/broadcast/playback";

export const dynamic = "force-dynamic";

/**
 * Resolve an X broadcast's HLS playback URL. The client then plays it through /api/x/hls (the CDN
 * blocks browser Origins, so it must be proxied server-side).
 *
 * GET /api/x/broadcast?handle=MarketBubble  (or ?id=<broadcastId> / a broadcast link)
 *   → { id, state, playbackUrl } | { state: "UNKNOWN", playbackUrl: null }
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("id") ?? req.nextUrl.searchParams.get("handle");
  if (!q) return NextResponse.json({ state: "UNKNOWN", playbackUrl: null });
  const pb = await resolvePlayback(q);
  if (!pb) return NextResponse.json({ state: "UNKNOWN", playbackUrl: null });
  return NextResponse.json(pb);
}

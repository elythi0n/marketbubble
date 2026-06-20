import { type NextRequest, NextResponse } from "next/server";

import { getXSourceStatus } from "@/lib/x/broadcast/manager";

export const dynamic = "force-dynamic";

/**
 * Live status + viewer count for an X handle, as tracked by the server-side X broadcast bridge
 * (instrumentation.ts → manager.ts). Lets the dashboard show X-only channels' live occupancy the
 * same way Twitch/Kick channels show viewers. Returns offline when the bridge isn't watching it.
 *
 * GET /api/x/stream?handle=banks → { live: boolean, viewers: number, title?: string }
 */
export function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return NextResponse.json({ live: false, viewers: 0 });

  const status = getXSourceStatus(handle);
  return NextResponse.json({
    // `tracked` = the bridge is actually watching this handle, so its live/offline verdict is
    // authoritative. Without it, callers can't tell "bridge says offline" from "bridge isn't
    // running for this handle" and would wrongly keep a static-live demo entry live forever.
    tracked: status !== undefined,
    live: status?.live ?? false,
    viewers: status?.viewers ?? 0,
    title: status?.title,
  });
}

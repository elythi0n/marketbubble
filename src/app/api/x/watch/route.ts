import { type NextRequest, NextResponse } from "next/server";

import { ensureWatching } from "@/lib/x/broadcast/live-chat";

export const dynamic = "force-dynamic";

/**
 * Keep-alive ping from the dashboard: "I'm viewing this X handle." The server lazily resolves the
 * handle's live broadcast and streams its chat into the shared X buffer (served by /api/x/chat).
 * Polled by the X chat provider while an X channel is on screen; readers idle-reap when pings stop.
 *
 * GET /api/x/watch?handle=banks → { live: boolean }
 */
export function GET(req: NextRequest) {
  const handle = req.nextUrl.searchParams.get("handle")?.trim().replace(/^@/, "");
  if (!handle) return NextResponse.json({ live: false });
  return NextResponse.json(ensureWatching(handle));
}

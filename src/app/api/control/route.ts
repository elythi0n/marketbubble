import { NextResponse } from "next/server";

import { getControlState } from "@/lib/server/control";

export const dynamic = "force-dynamic";

/** Snapshot of the public control state (announcement, flags, poll) — the non-SSE fallback. */
export async function GET() {
  return NextResponse.json(getControlState(), { headers: { "Cache-Control": "no-store" } });
}

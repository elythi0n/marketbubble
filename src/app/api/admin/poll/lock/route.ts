import { type NextRequest, NextResponse } from "next/server";

import { getControlState, lockPoll } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../../auth";

export const dynamic = "force-dynamic";

/** Ends voting now: locks the poll and fixes the winner. */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  lockPoll();
  return NextResponse.json({ poll: getControlState().poll });
}

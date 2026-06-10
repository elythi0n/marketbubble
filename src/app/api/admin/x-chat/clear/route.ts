import { type NextRequest, NextResponse } from "next/server";

import { clearMessages } from "@/lib/x/chat-buffer";
import { adminAuthorized, adminEnabled } from "../../auth";

export const dynamic = "force-dynamic";

/** Empties the X chat ingest buffer (e.g. before a fresh show session). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  return NextResponse.json({ cleared: clearMessages() });
}

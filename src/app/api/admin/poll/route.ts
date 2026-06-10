import { type NextRequest, NextResponse } from "next/server";

import { clearPoll, startPoll } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/** Starts a poll (replaces any active one). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { question?: string; options?: string[]; durationSec?: number; source?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  try {
    const poll = startPoll(
      String(body.question ?? ""),
      Array.isArray(body.options) ? body.options.map(String) : [],
      typeof body.durationSec === "number" ? body.durationSec : null,
      body.source === "polymarket" ? "polymarket" : "custom",
    );
    return NextResponse.json({ poll });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalid poll" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  clearPoll();
  return NextResponse.json({ poll: null });
}

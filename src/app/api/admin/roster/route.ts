import { type NextRequest, NextResponse } from "next/server";

import { getControlState, setRoster } from "@/lib/server/control";
import { adminAuthorized, adminEnabled } from "../auth";

export const dynamic = "force-dynamic";

/** Replaces the live roster (pushed to every open dashboard; restart restores the file roster). */
export async function POST(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });

  let body: { streamers?: { name?: string; handles?: { twitch?: string; kick?: string; x?: string }; pinned?: boolean }[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }
  if (!Array.isArray(body.streamers)) {
    return NextResponse.json({ error: "streamers array required" }, { status: 400 });
  }
  try {
    setRoster(body.streamers);
    return NextResponse.json({ roster: getControlState().roster });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "invalid roster" }, { status: 400 });
  }
}

/** Clears the override, returning to the configured roster. */
export async function DELETE(req: NextRequest) {
  if (!adminEnabled()) return new NextResponse(null, { status: 404 });
  if (!adminAuthorized(req)) return NextResponse.json({ error: "invalid key" }, { status: 401 });
  setRoster(null);
  return NextResponse.json({ roster: null });
}
